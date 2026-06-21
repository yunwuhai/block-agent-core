import { evaluate } from "../../backend/computation/policy/evaluator.ts";
import type { ActionContext } from "../../backend/computation/policy/evaluator.ts";
import type { MergedPolicy } from "../../backend/computation/policy/mod.ts";
import { getEventLog } from "../../backend/computation/prompt/engine.ts";
import type { RunDirectory } from "../../backend/storage/mod.ts";
import { appendEvent, appendToolLog } from "../../backend/storage/mod.ts";

export interface ToolInteractionResult {
  output: string;
  blocked: boolean;
}

export async function executeWithRetry(
  run: RunDirectory,
  runId: string,
  policy: MergedPolicy | null,
  actionCtx: ActionContext,
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
        await new Promise<void>((resolve) => {
          setTimeout(resolve, RETRY_DELAY_MS * Math.pow(2, attempt - 1));
        });
      }

      return await simulateToolInteraction(
        run, runId, policy, actionCtx, signal,
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
  actionCtx: ActionContext,
  signal?: AbortSignal,
): Promise<ToolInteractionResult> {
  if (signal?.aborted) {
    return { output: "[aborted]", blocked: true };
  }

  const decision = evaluate(actionCtx, policy);
  if (!decision.allowed) {
    await appendEvent(run, {
      timestamp: isoNow(),
      runId,
      event: "policy_block",
      toolName: actionCtx.toolName,
      reason: decision.reason,
    });
    return { output: `[blocked] ${decision.reason}`, blocked: true };
  }

  const toolArgs: Record<string, unknown> = {};
  if (actionCtx.filePath) toolArgs.path = actionCtx.filePath;
  if (actionCtx.command) toolArgs.command = actionCtx.command;
  if (actionCtx.url) toolArgs.url = actionCtx.url;

  const callEntry = {
    timestamp: isoNow(),
    runId,
    event: "call" as const,
    toolCallId: "t1",
    toolName: actionCtx.toolName,
    arguments: toolArgs,
  };
  await appendToolLog(run, callEntry);

  const output = `[simulated ${actionCtx.toolName} output]`;
  const isError = false;
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

  for (const change of getEventLog()) {
    await appendEvent(run, {
      timestamp: isoNow(),
      runId,
      event: "slot_mutation",
      operation: change.operation,
      slotName: change.slotName,
    });
  }

  return { output, blocked: false };
}

function isoNow(): string {
  return new Date().toISOString();
}
