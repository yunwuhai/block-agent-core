import {
  appendSessionEvent,
  compressMessageSequences,
  readCurrentContextState,
  readSessionConfig,
} from "../../core/session-store.ts";
import {
  createInputMessage,
  executeSessionTask,
  rollbackCreatedInputArtifacts,
  type SessionTaskRunnerDeps,
} from "../../core/session-runtime.ts";
import { getDefaultTaskScheduler, type TaskScheduler } from "../../core/task-scheduler.ts";
import type { ContextSource } from "../../core/context-sources.ts";
import type { ExtensionContextLike, ToolResponse } from "../shared.ts";
import { error, ok } from "../shared.ts";

export interface SendTaskParams {
  sessionId: string;
  requestKey?: string;
  inputText: string;
  temporarySources?: ContextSource[];
  metadata?: Record<string, unknown>;
}

export interface SendTaskDeps extends SessionTaskRunnerDeps {
  scheduler: TaskScheduler;
}

export async function handleSendMessage(
  params: SendTaskParams,
  ctx: ExtensionContextLike,
  deps?: Partial<SendTaskDeps>,
): Promise<ToolResponse> {
  try {
    await readSessionConfig(ctx.cwd, params.sessionId);
    const previousState = await readCurrentContextState(ctx.cwd, params.sessionId);

    const scheduler = deps?.scheduler ?? getDefaultTaskScheduler();
    const runtimeDeps: SessionTaskRunnerDeps = {
      composeContextText: deps?.composeContextText ?? (async (sources, separator) => {
        const { composeContext } = await import("../../core/context-sources.ts");
        return composeContext(sources, undefined, separator);
      }),
      runWithSdk: deps?.runWithSdk ?? (async (options) => {
        const { runSubagentWithPiSdk } = await import("../../adapter/pi-sdk.ts");
        return runSubagentWithPiSdk(options);
      }),
    };

    const created = await createInputMessage(
      ctx.cwd,
      params.sessionId,
      params.inputText,
      params.requestKey,
      params.metadata,
    );
    const registeredAt = new Date().toISOString();

    const { queuePosition } = scheduler.enqueue({
      taskId: params.requestKey ?? `${params.sessionId}:${created.inputMessage.seq}`,
      sessionId: params.sessionId,
      registeredAt: Date.now(),
      execute: async () => {
        try {
          const result = await executeSessionTask(ctx.cwd, params.sessionId, {
            ...(params.requestKey ? { requestKey: params.requestKey } : {}),
            inputText: params.inputText,
            inputSeq: created.inputMessage.seq,
            ...(created.parentSeq !== undefined ? { parentSeq: created.parentSeq } : {}),
            systemPromptSeqs: created.systemPromptSeqs,
            ...(params.temporarySources ? { temporarySources: params.temporarySources } : {}),
            ...(params.metadata ? { metadata: params.metadata } : {}),
          }, ctx, runtimeDeps);

          await appendSessionEvent(ctx.cwd, params.sessionId, {
            ...(params.requestKey ? { requestKey: params.requestKey } : {}),
            type: "send_finished",
            payload: {
              status: "completed",
              inputSeq: created.inputMessage.seq,
              ...(created.parentSeq !== undefined ? { parentSeq: created.parentSeq } : {}),
              systemPromptSeqRanges: compressMessageSequences(created.systemPromptSeqs),
              outputMessageSeqRanges: compressMessageSequences(result.outputMessageSeqs),
              activeMessageSeqRanges: compressMessageSequences(result.activeMessageSeqs),
              model: result.model,
              tools: result.tools,
            },
          });
        } catch (err) {
          await rollbackCreatedInputArtifacts(ctx.cwd, params.sessionId, created);
          await appendSessionEvent(ctx.cwd, params.sessionId, {
            ...(params.requestKey ? { requestKey: params.requestKey } : {}),
            type: "send_finished",
            payload: {
              status: "failed",
              inputSeq: created.inputMessage.seq,
              ...(created.parentSeq !== undefined ? { parentSeq: created.parentSeq } : {}),
              systemPromptSeqRanges: compressMessageSequences(created.systemPromptSeqs),
              activeMessageSeqRanges: compressMessageSequences(previousState.activeMessageSeqs),
              errorMessage: (err as Error).message,
            },
          });
        }
      },
    });

    await appendSessionEvent(ctx.cwd, params.sessionId, {
      ...(params.requestKey ? { requestKey: params.requestKey } : {}),
      type: "send_enqueued",
      payload: {
        queuePosition,
        registeredAt,
        inputSeq: created.inputMessage.seq,
        ...(created.parentSeq !== undefined ? { parentSeq: created.parentSeq } : {}),
        systemPromptSeqRanges: compressMessageSequences(created.systemPromptSeqs),
      },
    });

    const send = {
      sessionId: params.sessionId,
      status: "queued",
      registeredAt,
      queuePosition,
      inputSeq: created.inputMessage.seq,
      ...(created.parentSeq !== undefined ? { parentSeq: created.parentSeq } : {}),
      ...(params.requestKey ? { requestKey: params.requestKey } : {}),
    };
    return ok(JSON.stringify({ send }, null, 2), { send });
  } catch (err) {
    return error(`Error sending message: ${(err as Error).message}`);
  }
}

export const handleSendTask = handleSendMessage;
