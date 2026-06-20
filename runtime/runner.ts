import type { RunDirectory, EventEntry } from "../storage/mod.ts";
import {
  createRunDir,
  generateRunId,
  appendEvent,
  appendToolLog,
  appendSession,
  sessionExists,
  readEvents,
  readRunProfile,
} from "../storage/mod.ts";
import { writeHandoff } from "../storage/handoff-store.ts";
import { buildTranscript } from "../storage/transcript-projector.ts";
import type { ToolParams, ProfileDefinition, HooksConfig, ProjectPolicy } from "../config/mod.ts";
import { loadProfile } from "../config/profile-loader.ts";
import { loadProjectPolicy } from "../config/project-loader.ts";
import { renderPrompt, getEventLog } from "./prompt-slots/engine.ts";
import { injectHookOutputAsSlot } from "./hooks/slot-insertion.ts";
import { runHookScripts } from "./hooks/runner.ts";
import type { HookContext, HookResult, HookSessionMessage } from "./hooks/types.ts";
import { isoNow } from "../display/iso-now.ts";

// ---------------------------------------------------------------------------
// PhaseHookOutcome — extended return from runPhaseHook
// ---------------------------------------------------------------------------

interface PhaseHookOutcome {
  allowed: boolean;
  sessionMessages: HookSessionMessage[];
}
import type { MergedPolicy, PolicyEntry } from "../policy/mod.ts";
import { mergePolicies } from "../policy/merge.ts";
import { evaluate } from "../policy/evaluator.ts";
import type { ActionContext } from "../policy/evaluator.ts";
import type { DisplayEvent } from "../display/mod.ts";
import {
  formatRunStart,
  formatRunEnd,
  formatToolCall,
  formatToolResult,
  formatPolicyBlock,
  formatHookBlock,
  formatSlotChange,
  formatHandoff,
  createEvent,
} from "../display/mod.ts";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RunContext {
  readonly cwd: string;
  readonly params: ToolParams;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export interface RunResult {
  readonly runId: string;
  readonly status: "completed" | "failed" | "blocked";
  readonly handoffPath: string;
  readonly runDir: RunDirectory;
  readonly events: readonly DisplayEvent[];
  readonly output: string;
  readonly transcript?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface ToolInteractionResult {
  output: string;
  blocked: boolean;
}

/**
 * Convert a raw ProjectPolicy (with optional fields) into a clean PolicyEntry
 * suitable for passing to mergePolicies.
 */
function toPolicyEntry(raw: ProjectPolicy): PolicyEntry {
  return {
    ...(raw.tools !== undefined ? { tools: raw.tools } : {}),
    ...(raw.paths !== undefined ? { paths: raw.paths } : {}),
    ...(raw.excludePaths !== undefined ? { excludePaths: raw.excludePaths } : {}),
    ...(raw.bash !== undefined
      ? {
          bash: {
            ...(raw.bash.allow !== undefined ? { allow: raw.bash.allow } : {}),
            ...(raw.bash.deny !== undefined ? { deny: raw.bash.deny } : {}),
          },
        }
      : {}),
    ...(raw.network !== undefined
      ? {
          network: {
            allow: raw.network.allow ?? false,
            ...(raw.network.allowedDomains !== undefined
              ? { allowedDomains: raw.network.allowedDomains }
              : {}),
            ...(raw.network.deniedDomains !== undefined
              ? { deniedDomains: raw.network.deniedDomains }
              : {}),
          },
        }
      : {}),
    ...(raw.env !== undefined
      ? {
          env: {
            ...(raw.env.allow !== undefined ? { allow: raw.env.allow } : {}),
            ...(raw.env.deny !== undefined ? { deny: raw.env.deny } : {}),
          },
        }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// executeRun
// ---------------------------------------------------------------------------

export async function executeRun(ctx: RunContext): Promise<RunResult> {
  // -- Global timeout setup --
  const DEFAULT_RUN_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  const runTimeoutMs = ctx.timeoutMs ?? DEFAULT_RUN_TIMEOUT_MS;

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort(new Error(`Run timed out after ${runTimeoutMs}ms`));
  }, runTimeoutMs);

  // Forward user-provided signal to our controller
  if (ctx.signal) {
    if (ctx.signal.aborted) {
      abortController.abort(ctx.signal.reason);
    } else {
      ctx.signal.addEventListener("abort", () => {
        abortController.abort(ctx.signal!.reason);
      }, { once: true });
    }
  }

  const effectiveSignal = abortController.signal;

  // -- AbortSignal checkpoint (start) --
  if (effectiveSignal.aborted) {
    clearTimeout(timeoutId);
    throw new Error("Run aborted before start");
  }

  try {
  const events: DisplayEvent[] = [];
  let status: "completed" | "failed" | "blocked" = "completed";

  // -- Resolve runId & session continuation --
  const baseRunId: string = ctx.params.runId ?? generateRunId();
  const isContinuation = ctx.params.runId ? await sessionExists(ctx.cwd, ctx.params.runId) : false;
  const runId = isContinuation ? `${baseRunId}-cont${Date.now().toString(36)}` : baseRunId;

  const run = await createRunDir(ctx.cwd, runId, ctx.params.profile, ctx.params.task);

  // Write complete session metadata (profile + task)
  await writeFile(run.sessionStatePath, JSON.stringify({
    runId,
    startedAt: new Date().toISOString(),
    status: "running",
    profile: ctx.params.profile,
    task: ctx.params.task,
  }) + "\n", "utf-8");

  await appendEvent(run, {
    timestamp: isoNow(),
    runId,
    event: isContinuation ? "run_continue" : "run_created",
    continuation: isContinuation,
  });

  // -- Profile consistency check on continuation --
  if (isContinuation) {
    const originalProfile = await readRunProfile(ctx.cwd, ctx.params.runId!);
    if (originalProfile && originalProfile !== ctx.params.profile) {
      events.push(createEvent({
        type: "policy",
        label: "Profile mismatch",
        detail: `Continuing run originally created with profile "${originalProfile}" using profile "${ctx.params.profile}". Tools and permissions may differ.`,
        status: "blocked",
      }));
      await appendEvent(run, {
        timestamp: isoNow(),
        runId,
        event: "profile_mismatch",
        originalProfile,
        newProfile: ctx.params.profile,
      });
    }
  }

  // -- Load profile (throws if missing) --
  let profile: ProfileDefinition;
  try {
    profile = await loadProfile(ctx.cwd, ctx.params.profile);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to load profile "${ctx.params.profile}": ${message}`);
  }

  // -- AbortSignal checkpoint --
  if (effectiveSignal.aborted) {
    throw new Error("Run aborted after profile load");
  }

  // -- Load project policy (graceful — null = allow all) --
  const rawProjectPolicy = await loadProjectPolicy(ctx.cwd);

  // Build PolicyEntry (merge.ts types use readonly vs. schema.ts optionals)
  const projectPolicy: PolicyEntry | null =
    rawProjectPolicy !== null ? toPolicyEntry(rawProjectPolicy) : null;

  // -- Merge policy --
  let policy: MergedPolicy;
  if (profile.frontmatter.tools && profile.frontmatter.tools.length > 0) {
    policy = mergePolicies(projectPolicy, { tools: profile.frontmatter.tools });
  } else {
    policy = mergePolicies(projectPolicy);
  }

  // -- Build agent HookContext --
  const hooksConfig: HooksConfig | undefined = profile.frontmatter.hooks;

  const agentHookCtx: HookContext = {
    phase: "before_agent",
    profile: ctx.params.profile,
    task: ctx.params.task,
    runId,
    cwd: ctx.cwd,
  };

  // -- Run before_agent hooks --
  const beforeOutcome = await runPhaseHook(
    hooksConfig,
    { ...agentHookCtx, phase: "before_agent" },
    events,
  );

  if (effectiveSignal.aborted) {
    throw new Error("Run aborted after before_agent hooks");
  }

  if (!beforeOutcome.allowed) {
    status = "blocked";
  }

  // Insert before_agent session messages
  for (const msg of beforeOutcome.sessionMessages) {
    await appendSession(run, { timestamp: isoNow(), runId, event: "message", ...msg });
  }

  // -- Build prompt from profile body --
  const fullPrompt = renderPrompt(profile.prompt);
  events.push(formatRunStart(ctx.params.profile, ctx.params.task));
  await appendEvent(run, {
    timestamp: isoNow(),
    runId,
    event: "run_start",
    profile: ctx.params.profile,
    task: ctx.params.task,
  });

  // -- Continuation: load prior events for context --
  if (isContinuation) {
    try {
      const priorEvents = await readEvents(run);
      if (priorEvents.length > 0) {
        events.push(createEvent({
          type: "run_start",
          label: "Continuation context loaded",
          detail: `${priorEvents.length} prior events`,
          status: "ok",
        }));
      }
    } catch {
      // best-effort context loading
    }
  }

  await appendSession(run, {
    timestamp: isoNow(),
    runId,
    event: "message",
    role: "user",
    content: fullPrompt,
  });

  // -- Agent execution (only if not blocked) --
  if (!beforeOutcome.allowed) {
    events.push(
      formatPolicyBlock("Blocked by before_agent hooks — agent execution skipped"),
    );
  } else {
    // Build ActionContext sequence: use params.actions if provided, else fall back to default
    function toActionContext(a: typeof ctx.params.actions extends (infer T)[] | undefined ? T : never): ActionContext {
      const result: { toolName: string; filePath?: string; command?: string; url?: string; envVar?: string } = { toolName: a.toolName };
      if (a.filePath !== undefined) result.filePath = a.filePath;
      if (a.command !== undefined) result.command = a.command;
      if (a.url !== undefined) result.url = a.url;
      if (a.envVar !== undefined) result.envVar = a.envVar;
      return result;
    }
    const actions: ActionContext[] = ctx.params.actions && ctx.params.actions.length > 0
      ? ctx.params.actions.map(toActionContext)
      : [{ toolName: "read", filePath: "file.txt" }];

    status = "completed";

    for (let i = 0; i < actions.length; i++) {
      const actionCtx = actions[i]!;

      if (effectiveSignal.aborted) {
        status = "blocked";
        break;
      }

      try {
        const toolResult = await executeWithRetry(
          run,
          runId,
          policy,
          hooksConfig,
          events,
          actionCtx,
          ctx.params.profile,
          ctx.params.task,
          ctx.cwd,
          effectiveSignal,
        );

        await appendSession(run, {
          timestamp: isoNow(),
          runId,
          event: "message",
          role: "assistant",
          content: toolResult.output,
        });

        if (toolResult.blocked) {
          status = "blocked";
          break;
        }
      } catch (err) {
        if (effectiveSignal.aborted) {
          status = "blocked";
          break;
        }
        if (status !== "blocked") {
          status = "failed";
        }
        await appendSession(run, {
          timestamp: isoNow(),
          runId,
          event: "message",
          role: "assistant",
          content: `[action ${i + 1}/${actions.length} failed] ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }

  // -- AbortSignal checkpoint --
  if (effectiveSignal.aborted) {
    throw new Error("Run aborted before after_agent hooks");
  }

  // -- Run after_agent hooks --
  const afterOutcome = await runPhaseHook(
    hooksConfig,
    { ...agentHookCtx, phase: "after_agent" },
    events,
  );

  if (!afterOutcome.allowed) {
    if (status !== "blocked") {
      status = "blocked";
    }
  }

  // Insert after_agent session messages
  for (const msg of afterOutcome.sessionMessages) {
    await appendSession(run, { timestamp: isoNow(), runId, event: "message", ...msg });
  }

  // -- Build transcript --
  let transcriptMarkdown: string | undefined;
  try {
    const transcriptView = await buildTranscript(run);
    transcriptMarkdown = transcriptView.markdown;

    // Auto-generate transcript.md in run directory
    if (transcriptMarkdown) {
      const transcriptPath = join(run.dir, "transcript.md");
      await writeFile(transcriptPath, transcriptMarkdown, "utf-8");
      events.push(createEvent({ type: "handoff", label: "Transcript saved", detail: transcriptPath, status: "ok" }));
    }
  } catch (err) {
    // Transcript is best-effort; a failure here doesn't fail the run
    events.push(formatPolicyBlock(`Transcript build failed: ${err instanceof Error ? err.message : String(err)}`));
    await appendEvent(run, {
      timestamp: isoNow(),
      runId,
      event: "transcript_error",
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // -- Write handoff --
  const exitCode = status === "completed" ? 0 : 1;

  // Extract metadata from raw events for the enhanced handoff
  let rawEvents: EventEntry[] = [];
  try {
    rawEvents = await readEvents(run);
  } catch {
    // best-effort; handoff still works without raw event extraction
  }

  const filesTouched = extractFilesTouched(rawEvents);
  const toolSummary = extractToolSummary(rawEvents);
  const blockContext = extractBlockContext(rawEvents);
  const startedAt = events.length > 0 ? events[0]!.timestamp : undefined;

  const summaryAccomplished: string[] = [
    `Loaded profile "${ctx.params.profile}"`,
  ];
  if (isContinuation) {
    summaryAccomplished.push("Resumed prior session");
  }
  if (!beforeOutcome.allowed) {
    summaryAccomplished.push("Agent execution skipped (blocked by before_agent hooks)");
  } else {
    summaryAccomplished.push("Executed hooks (before_agent)");
    for (const ft of filesTouched) {
      summaryAccomplished.push(`Tool: ${ft.operation} ${ft.path}`);
    }
    summaryAccomplished.push("Generated transcript");
  }

  const handoffBlock = {
    runId,
    profile: ctx.params.profile,
    agent: "efficiency-subagent",
    status,
    exitCode,
    isContinuation,
    endedAt: isoNow(),
    summary: {
      task: ctx.params.task,
      result:
        status === "completed"
          ? `Run completed successfully with ${events.length} events.`
          : status === "blocked"
            ? `Run blocked. ${events.length} events recorded.`
            : `Run failed with ${events.length} events.`,
      accomplished: summaryAccomplished,
      pending: status === "blocked"
        ? ["Resolve policy/hook block and retry"]
        : [],
    },
    artifacts: [
      { path: run.eventsPath, description: "Structured event log (JSONL format)" },
      { path: run.toolsPath, description: "Tool call/result log (JSONL format)" },
      { path: run.handoffPath, description: "This handoff document" },
    ],
    ...(ctx.params.task !== undefined ? { task: ctx.params.task } : {}),
    ...(startedAt !== undefined ? { startedAt } : {}),
    ...(filesTouched.length > 0 ? { filesTouched } : {}),
    ...(toolSummary.length > 0 ? { toolSummary } : {}),
    ...(transcriptMarkdown ? { finalOutput: transcriptMarkdown.slice(0, 4000) } : {}),
    ...(blockContext !== undefined ? { blockContext } : {}),
  };

  const handoffPath = await writeHandoff(run, handoffBlock);
  await appendEvent(run, {
    timestamp: isoNow(),
    runId,
    event: "handoff_written",
    path: handoffPath,
  });
  events.push(formatHandoff(handoffPath));

  // -- Append run_end event --
  events.push(formatRunEnd(status === "completed"));
  await appendEvent(run, {
    timestamp: isoNow(),
    runId,
    event: "run_end",
    status,
    exitCode,
  });

  // Write final session state with profile, task, and endedAt
  await writeFile(run.sessionStatePath, JSON.stringify({
    runId,
    startedAt: new Date().toISOString(),
    status,
    profile: ctx.params.profile,
    task: ctx.params.task,
    endedAt: isoNow(),
  }) + "\n", "utf-8");

  const outputText =
    status === "completed"
      ? "Run completed."
      : status === "blocked"
        ? "Run blocked."
        : "Run failed.";

  return {
    runId,
    status,
    handoffPath,
    runDir: run,
    events,
    output: outputText,
    ...(transcriptMarkdown !== undefined
      ? { transcript: transcriptMarkdown }
      : {}),
  };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// runPhaseHook
// ---------------------------------------------------------------------------

/**
 * Execute hook scripts for a given phase.
 *
 * Returns `true` when the action should proceed, `false` when blocked.
 * Silently returns `true` when no hooks are configured for the phase.
 */
async function runPhaseHook(
  hooks: HooksConfig | undefined,
  ctx: HookContext,
  events: DisplayEvent[],
): Promise<PhaseHookOutcome> {
  if (!hooks) return { allowed: true, sessionMessages: [] };

  // Determine which scripts to run for this phase
  let scripts: string[] | undefined;

  switch (ctx.phase) {
    case "before_agent":
      scripts = hooks.before_agent;
      break;
    case "after_agent":
      scripts = hooks.after_agent;
      break;
    case "before_tool": {
      const toolName = ctx.toolName;
      if (toolName) {
        scripts = hooks.tools?.[toolName]?.before;
      }
      break;
    }
    case "after_tool": {
      const toolName = ctx.toolName;
      if (toolName) {
        scripts = hooks.tools?.[toolName]?.after;
      }
      break;
    }
  }

  // No scripts configured for this phase → allow by default
  if (!scripts || scripts.length === 0) {
    return { allowed: true, sessionMessages: [] };
  }

  // Execute hooks
  let result: HookResult;
  try {
    result = await runHookScripts(scripts, ctx, hooks.timeoutMs);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    events.push(formatHookBlock(`Hook phase ${ctx.phase} error: ${message}`));
    return { allowed: false, sessionMessages: [] };
  }

  if (!result.allowed) {
    events.push(
      formatHookBlock(`Hook ${ctx.phase} blocked: ${result.reason}`),
    );
    return { allowed: false, sessionMessages: [] };
  }

  // Inject slot content from successful hooks
  if (result.slotContent && result.slotContent !== "") {
    injectHookOutputAsSlot(ctx.phase, result, ctx.profile);
  }

  // Collect session messages
  const sessionMessages: HookSessionMessage[] = [];
  if (result.sessionMessage) {
    sessionMessages.push(result.sessionMessage);
  }

  return { allowed: true, sessionMessages };
}

// ---------------------------------------------------------------------------
// executeWithRetry
// ---------------------------------------------------------------------------

/**
 * Execute simulateToolInteraction with retry logic for transient failures.
 */
async function executeWithRetry(
  run: RunDirectory,
  runId: string,
  policy: MergedPolicy | null,
  hooksConfig: HooksConfig | undefined,
  events: DisplayEvent[],
  actionCtx: ActionContext,
  profileName: string,
  task: string,
  cwd: string,
  signal?: AbortSignal,
): Promise<ToolInteractionResult> {
  const MAX_RETRIES = 2;
  const RETRY_DELAY_MS = 1000;
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (signal?.aborted) {
      return { output: "[aborted]", blocked: true };
    }

    try {
      if (attempt > 0) {
        events.push(createEvent({
          type: "run_start",
          label: `Retry attempt ${attempt}/${MAX_RETRIES}`,
          detail: `Previous attempt failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
          status: "running",
        }));
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * Math.pow(2, attempt - 1)));
      }

      return await simulateToolInteraction(
        run, runId, policy, hooksConfig, events, actionCtx,
        profileName, task, cwd, signal,
      );
    } catch (err) {
      lastError = err;

      if (signal?.aborted) {
        return { output: "[aborted]", blocked: true };
      }

      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("timeout") || message.includes("network") || message.includes("ECONNREFUSED")) {
        continue;
      }

      throw err;
    }
  }

  return { output: `[failed after ${MAX_RETRIES} retries] ${lastError instanceof Error ? lastError.message : String(lastError)}`, blocked: false };
}

// ---------------------------------------------------------------------------
// simulateToolInteraction
// ---------------------------------------------------------------------------

/**
 * Simulate a tool call with policy enforcement and hook integration.
 *
 * Returns the tool output and whether the interaction was blocked.
 */
async function simulateToolInteraction(
  run: RunDirectory,
  runId: string,
  policy: MergedPolicy | null,
  hooksConfig: HooksConfig | undefined,
  events: DisplayEvent[],
  actionCtx: ActionContext,
  profileName: string,
  task: string,
  cwd: string,
  signal?: AbortSignal,
): Promise<ToolInteractionResult> {
  // -- AbortSignal checkpoint --
  if (signal?.aborted) {
    return { output: "[aborted]", blocked: true };
  }

  // -- Policy check before tool call --
  const decision = evaluate(actionCtx, policy);
  if (!decision.allowed) {
    events.push(formatPolicyBlock(decision.reason));
    await appendEvent(run, {
      timestamp: isoNow(),
      runId,
      event: "policy_block",
      toolName: actionCtx.toolName,
      reason: decision.reason,
    });
    return { output: `[blocked] ${decision.reason}`, blocked: true };
  }

  // -- Before-tool hook --
  const toolHookCtx: HookContext = {
    phase: "before_tool",
    profile: profileName,
    task,
    runId,
    cwd,
    toolName: actionCtx.toolName,
    toolArgs: {
      path: actionCtx.filePath,
      command: actionCtx.command,
      url: actionCtx.url,
      envVar: actionCtx.envVar,
    },
  };

  const beforeOutcome = await runPhaseHook(hooksConfig, toolHookCtx, events);
  if (!beforeOutcome.allowed) {
    return {
      output: `[blocked] before_tool hook blocked ${actionCtx.toolName}`,
      blocked: true,
    };
  }

  // Insert before_tool session messages
  for (const msg of beforeOutcome.sessionMessages) {
    await appendSession(run, { timestamp: isoNow(), runId, event: "message", ...msg });
  }

  // -- Simulated tool call --
  const toolArgs: Record<string, unknown> = {};
  if (actionCtx.filePath) toolArgs.path = actionCtx.filePath;
  if (actionCtx.command) toolArgs.command = actionCtx.command;
  if (actionCtx.url) toolArgs.url = actionCtx.url;

  events.push(formatToolCall(actionCtx.toolName, toolArgs));
  const callEntry = {
    timestamp: isoNow(),
    runId,
    event: "call" as const,
    toolCallId: "t1",
    toolName: actionCtx.toolName,
    arguments: toolArgs,
  };
  await appendToolLog(run, callEntry);

  // Simulated output
  const output = `[simulated ${actionCtx.toolName} output]`;
  const isError = false;
  events.push(formatToolResult(actionCtx.toolName, output, isError));
  const resultEntry = {
    timestamp: isoNow(),
    runId,
    event: "result" as const,
    toolCallId: "t1",
    toolName: actionCtx.toolName,
    output,
    isError,
  };
  await appendToolLog(run, resultEntry);
  await appendEvent(run, {
    timestamp: isoNow(),
    runId,
    event: "tool_call",
    toolName: actionCtx.toolName,
    arguments: toolArgs,
  });
  await appendEvent(run, {
    timestamp: isoNow(),
    runId,
    event: "tool_result",
    toolName: actionCtx.toolName,
    output,
    isError,
  });

  // -- After-tool hook --
  const afterToolCtx: HookContext = {
    ...toolHookCtx,
    phase: "after_tool",
  };

  const afterOutcome = await runPhaseHook(hooksConfig, afterToolCtx, events);
  if (!afterOutcome.allowed) {
    return {
      output: `[blocked] after_tool hook blocked ${actionCtx.toolName}`,
      blocked: true,
    };
  }

  // Insert after_tool session messages
  for (const msg of afterOutcome.sessionMessages) {
    await appendSession(run, { timestamp: isoNow(), runId, event: "message", ...msg });
  }

  // -- Log slot mutations --
  for (const change of getEventLog()) {
    await appendEvent(run, {
      timestamp: isoNow(),
      runId,
      event: "slot_mutation",
      operation: change.operation,
      slotName: change.slotName,
    });
    events.push(formatSlotChange(change.slotName, change.operation));
  }

  return { output, blocked: false };
}

// ---------------------------------------------------------------------------
// Handoff extractors
// ---------------------------------------------------------------------------

function extractFilesTouched(
  rawEvents: readonly EventEntry[],
): { readonly path: string; readonly operation: "read" | "write" | "edit" | "delete" | "bash" }[] {
  const result: { path: string; operation: "read" | "write" | "edit" | "delete" | "bash" }[] = [];
  for (const e of rawEvents) {
    if (e.event !== "tool_call") continue;
    const toolName = String(e.toolName ?? "read");
    const args = (e.arguments as Record<string, unknown> | undefined) ?? {};
    const operation = mapToolToOperation(toolName);
    const filePath = extractFilePath(toolName, args);
    if (filePath) {
      result.push({ path: filePath, operation });
    }
  }
  return result;
}

function mapToolToOperation(
  toolName: string,
): "read" | "write" | "edit" | "delete" | "bash" {
  switch (toolName) {
    case "write":
      return "write";
    case "edit":
      return "edit";
    case "delete":
      return "delete";
    case "bash":
      return "bash";
    default:
      return "read";
  }
}

function extractFilePath(
  toolName: string,
  args: Record<string, unknown>,
): string | undefined {
  if (toolName === "bash") {
    return typeof args.command === "string" ? args.command : undefined;
  }
  return (typeof args.path === "string" && args.path) ||
    (typeof args.filePath === "string" && args.filePath) ||
    undefined;
}

function extractToolSummary(
  rawEvents: readonly EventEntry[],
): { readonly toolName: string; readonly count: number }[] {
  const counts = new Map<string, number>();
  for (const e of rawEvents) {
    if (e.event !== "tool_call") continue;
    const toolName = String(e.toolName ?? "read");
    counts.set(toolName, (counts.get(toolName) ?? 0) + 1);
  }
  return Array.from(counts, ([toolName, count]) => ({ toolName, count }));
}

function extractBlockContext(
  rawEvents: readonly EventEntry[],
): {
  readonly reason: string;
  readonly triggeredBy?: string;
  readonly policyRule?: string;
  readonly suggestion?: string;
} | undefined {
  for (const e of rawEvents) {
    if (e.event !== "policy_block") continue;
    return {
      reason: String(e.reason ?? "policy violation"),
      ...(typeof e.triggeredBy === "string" ? { triggeredBy: e.triggeredBy } : {}),
      ...(typeof e.policyRule === "string" ? { policyRule: e.policyRule } : {}),
      ...(typeof e.suggestion === "string" ? { suggestion: e.suggestion } : {}),
    };
  }
  return undefined;
}
