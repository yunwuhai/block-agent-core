import type { HooksConfig } from "../../backend/input/mod.ts";
import type { DisplayEvent } from "../display/mod.ts";
import {
  createEvent,
  formatHookBlock,
  formatPolicyBlock,
  formatSlotChange,
  formatToolCall,
  formatToolResult,
} from "../display/mod.ts";
import { isoNow } from "../display/iso-now.ts";
import { evaluate } from "../../backend/computation/policy/evaluator.ts";
import type { ActionContext } from "../../backend/computation/policy/evaluator.ts";
import type { MergedPolicy } from "../../backend/computation/policy/mod.ts";
import { runHookScripts } from "../../backend/computation/hooks/runner.ts";
import { registerHookOutput } from "../../backend/computation/hooks/slot-insertion.ts";
import type { HookContext, HookResult, HookSessionMessage } from "../../backend/computation/hooks/types.ts";
import { getEventLog } from "../../backend/computation/prompt/engine.ts";
import type { RunDirectory } from "../../backend/storage/mod.ts";
import { appendEvent, appendSession, appendToolLog } from "../../backend/storage/mod.ts";

export interface PhaseHookOutcome {
  allowed: boolean;
  sessionMessages: HookSessionMessage[];
}

export interface ToolInteractionResult {
  output: string;
  blocked: boolean;
}

export async function runPhaseHook(
  hooks: HooksConfig | undefined,
  ctx: HookContext,
  events: DisplayEvent[],
): Promise<PhaseHookOutcome> {
  if (!hooks) return { allowed: true, sessionMessages: [] };

  const scripts = selectHookScripts(hooks, ctx);

  if (!scripts || scripts.length === 0) {
    return { allowed: true, sessionMessages: [] };
  }

  let result: HookResult;
  try {
    result = await runHookScripts(scripts, ctx, hooks.timeoutMs);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    events.push(formatHookBlock(`Hook phase ${ctx.phase} error: ${message}`));
    return { allowed: false, sessionMessages: [] };
  }

  if (!result.allowed) {
    events.push(formatHookBlock(`Hook ${ctx.phase} blocked: ${result.reason}`));
    return { allowed: false, sessionMessages: [] };
  }

  if (result.slotContent && result.slotContent !== "") {
    registerHookOutput(result, ctx);
  }

  const sessionMessages: HookSessionMessage[] = [];
  if (result.sessionMessage) {
    sessionMessages.push(result.sessionMessage);
  }

  return { allowed: true, sessionMessages };
}

function selectHookScripts(
  hooks: HooksConfig,
  ctx: HookContext,
): string[] | undefined {
  switch (ctx.phase) {
    case "before_agent":
      return hooks.before_agent;
    case "after_agent":
      return hooks.after_agent;
    case "before_tool":
      return ctx.toolName ? hooks.tools?.[ctx.toolName]?.before : undefined;
    case "after_tool":
      return ctx.toolName ? hooks.tools?.[ctx.toolName]?.after : undefined;
  }
}

export async function executeWithRetry(
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
        await new Promise<void>((resolve) => {
          setTimeout(resolve, RETRY_DELAY_MS * Math.pow(2, attempt - 1));
        });
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

export async function simulateToolInteraction(
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
  if (signal?.aborted) {
    return { output: "[aborted]", blocked: true };
  }

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

  for (const msg of beforeOutcome.sessionMessages) {
    await appendSession(run, { timestamp: isoNow(), runId, event: "message", ...msg });
  }

  const hookOutputParts: string[] = [];
  for (const msg of beforeOutcome.sessionMessages) {
    hookOutputParts.push(msg.content);
  }

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

  let output = `[simulated ${actionCtx.toolName} output]`;
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

  for (const msg of afterOutcome.sessionMessages) {
    await appendSession(run, { timestamp: isoNow(), runId, event: "message", ...msg });
  }

  for (const msg of afterOutcome.sessionMessages) {
    hookOutputParts.push(msg.content);
  }

  if (hookOutputParts.length > 0) {
    output = `${hookOutputParts.join("\n\n")}\n\n${output}`;
  }

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
