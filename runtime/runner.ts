import { existsSync } from "node:fs";
import type { RunDirectory } from "../storage/mod.ts";
import { createRunDir, generateRunId, appendEvent, appendToolLog, appendSession } from "../storage/mod.ts";
import { startSession, finishSession } from "../storage/session-store.ts";
import { writeHandoff } from "../storage/handoff-store.ts";
import type { ToolParams } from "../config/mod.ts";
import { renderPrompt, getEventLog } from "./prompt-slots/engine.ts";
import { injectHookOutputAsSlot } from "./hooks/slot-insertion.ts";
import { runHookScript } from "./hooks/runner.ts";
import type { PolicyEntry, MergedPolicy } from "../policy/mod.ts";
import { mergePolicies } from "../policy/merge.ts";
import { evaluate } from "../policy/evaluator.ts";
import type { DisplayEvent } from "../display/mod.ts";
import { formatRunStart, formatRunEnd, formatToolCall, formatToolResult, formatHook, formatPolicyBlock } from "../display/mod.ts";

export interface RunContext {
  readonly cwd: string;
  readonly params: ToolParams;
  readonly projectPolicy: PolicyEntry | null;
  readonly mergedPolicy: MergedPolicy | null;
  readonly filePath?: string;
}

export interface RunResult {
  readonly runId: string;
  readonly status: "completed" | "failed";
  readonly handoffPath: string;
  readonly runDir: RunDirectory;
  readonly events: readonly DisplayEvent[];
  readonly output: string;
}

export async function executeRun(ctx: RunContext): Promise<RunResult> {
  const runId = ctx.params.runId ?? generateRunId();
  const run = await createRunDir(ctx.cwd, runId);
  startSession(runId);

  const events: DisplayEvent[] = [];

  // --- Build policy ---
  const policy = mergePolicies(ctx.projectPolicy);

  // --- Before-agent hooks ---
  await runPhaseHook("before_agent", ctx.params.profile, events);

  // --- Emit run start ---
  const profilePrompt = `Profile: ${ctx.params.profile}\n\nTask: ${ctx.params.task}`;
  const fullPrompt = renderPrompt(profilePrompt);
  events.push(formatRunStart(ctx.params.profile, ctx.params.task));
  await appendEvent(run, { timestamp: isoNow(), runId, event: "run_start", profile: ctx.params.profile, task: ctx.params.task });
  await appendSession(run, { timestamp: isoNow(), runId, event: "message", role: "user", content: fullPrompt });

  // --- Simulated tool calls (stub — real PI child integration goes here) ---
  let failed = false;
  try {
    // Example: simulate a read tool call (filePath defaults to "file.txt" for backward compat)
    const toolResult = await simulateToolInteraction(run, runId, "read", { path: ctx.filePath ?? "file.txt" }, policy, events);
    await appendSession(run, { timestamp: isoNow(), runId, event: "message", role: "assistant", content: toolResult });
  } catch {
    failed = true;
  }

  // --- After-agent hooks ---
  await runPhaseHook("after_agent", ctx.params.profile, events);

  // --- Handoff ---
  const handoffPath = await writeHandoff(run, {
    runId,
    profile: ctx.params.profile,
    status: failed ? "failed" : "completed",
    summary: `Task: ${ctx.params.task}. Completed with ${events.length} events.`,
    artifacts: [run.eventsPath, run.toolsPath, run.handoffPath],
  });
  await appendEvent(run, { timestamp: isoNow(), runId, event: "handoff_written", path: handoffPath });

  finishSession(runId, failed);
  events.push(formatRunEnd(!failed));

  return {
    runId,
    status: failed ? "failed" : "completed",
    handoffPath,
    runDir: run,
    events,
    output: failed ? "Run failed." : "Run completed.",
  };
}

async function runPhaseHook(phase: string, profile: string, events: DisplayEvent[]): Promise<void> {
  const scriptPath = `./hooks/${phase}.sh`;
  if (!existsSync(scriptPath)) return;
  const result = await runHookScript(scriptPath, { phase, profile });
  events.push(formatHook(phase, scriptPath, result.exitCode === 0));
  if (result.stdout) {
    injectHookOutputAsSlot(phase as never, result, profile);
  }
}

async function simulateToolInteraction(
  run: RunDirectory,
  runId: string,
  toolName: string,
  args: Record<string, unknown>,
  policy: MergedPolicy | null,
  events: DisplayEvent[],
): Promise<string> {
  // Policy check before tool call
  const decision = evaluate({ toolName, filePath: args.path as string | undefined }, policy);
  if (!decision.allowed) {
    events.push(formatPolicyBlock(decision.reason));
    await appendEvent(run, { timestamp: isoNow(), runId, event: "policy_block", toolName, reason: decision.reason });
    return `[blocked] ${decision.reason}`;
  }

  // Before-tool hook
  await runPhaseHook("before_tool", toolName, events);

  // Tool call
  events.push(formatToolCall(toolName, args));
  const callEntry = { timestamp: isoNow(), runId, event: "call", toolCallId: "t1", toolName, arguments: args };
  await appendToolLog(run, callEntry);

  // Simulated result
  const output = `[simulated ${toolName} output]`;
  events.push(formatToolResult(toolName, output, false));
  const resultEntry = { timestamp: isoNow(), runId, event: "result", toolCallId: "t1", toolName, output, isError: false };
  await appendToolLog(run, resultEntry);
  await appendEvent(run, { timestamp: isoNow(), runId, event: "tool_call", toolName, arguments: args });
  await appendEvent(run, { timestamp: isoNow(), runId, event: "tool_result", toolName, output, isError: false });

  // After-tool hook
  await runPhaseHook("after_tool", toolName, events);

  // Log slot mutations
  for (const change of getEventLog()) {
    await appendEvent(run, { timestamp: isoNow(), runId, event: "slot_mutation", operation: change.operation, slotName: change.slotName });
  }

  return output;
}

function isoNow(): string {
  return new Date().toISOString();
}
