import {
  allocateTurnId,
  appendSessionEvent,
  compressMessageRanges,
  readCurrentContextState,
  readSessionConfig,
} from "../../core/session-store.ts";
import { nowIso } from "../../utils/datetime.ts";
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
  inputText: string;
  temporarySources?: ContextSource[];
  timeoutMs?: number;
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
    const turnId = await allocateTurnId(ctx.cwd, params.sessionId);

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
      turnId,
      params.metadata,
    );
    const registeredAt = nowIso();

    const { queuePosition } = scheduler.enqueue({
      taskId: String(turnId),
      sessionId: params.sessionId,
      registeredAt: Date.now(),
      execute: async () => {
        try {
          const result = await executeSessionTask(ctx.cwd, params.sessionId, {
            turnId,
            inputText: params.inputText,
            inputId: created.inputMessage.id,
            ...(created.parentId !== undefined ? { parentId: created.parentId } : {}),
            ...(params.temporarySources ? { temporarySources: params.temporarySources } : {}),
            ...(params.timeoutMs ? { timeoutMs: params.timeoutMs } : {}),
            ...(params.metadata ? { metadata: params.metadata } : {}),
          }, ctx, runtimeDeps);

          await appendSessionEvent(ctx.cwd, params.sessionId, {
            turnId,
            type: "send_finished",
            payload: {
              status: "completed",
              inputId: created.inputMessage.id,
              ...(created.parentId !== undefined ? { parentId: created.parentId } : {}),
              outputMessageIdRanges: compressMessageRanges(result.outputMessageIds),
              activeMessageIdRanges: compressMessageRanges(result.activeMessageIds),
              model: result.model,
              tools: result.tools,
            },
          });
        } catch (err) {
          await rollbackCreatedInputArtifacts(ctx.cwd, params.sessionId, created);
          await appendSessionEvent(ctx.cwd, params.sessionId, {
            turnId,
            type: "send_finished",
            payload: {
              status: "failed",
              inputId: created.inputMessage.id,
              ...(created.parentId !== undefined ? { parentId: created.parentId } : {}),
              activeMessageIdRanges: compressMessageRanges(previousState.activeMessageIds),
              errorMessage: (err as Error).message,
            },
          });
        }
      },
    });

    await appendSessionEvent(ctx.cwd, params.sessionId, {
      turnId,
      type: "send_enqueued",
      payload: {
        queuePosition,
        registeredAt,
        inputId: created.inputMessage.id,
        ...(created.parentId !== undefined ? { parentId: created.parentId } : {}),
      },
    });

    const send = {
      sessionId: params.sessionId,
      turnId,
      status: "queued",
      registeredAt,
      queuePosition,
      inputId: created.inputMessage.id,
      ...(created.parentId !== undefined ? { parentId: created.parentId } : {}),
    };
    return ok(JSON.stringify({ send }, null, 2), { send });
  } catch (err) {
    return error(`Error sending message: ${(err as Error).message}`);
  }
}

export const handleSendTask = handleSendMessage;
