import {
  appendSessionEvent,
  createSessionTask,
  getSessionTask,
  listSessions,
  readTasks,
  updateSessionTask,
  type SessionTaskRecord,
} from "../../core/session-store.ts";
import { executeSessionTask, type SessionTaskRunnerDeps } from "../../core/session-runtime.ts";
import { getDefaultTaskScheduler, type TaskScheduler } from "../../core/task-scheduler.ts";
import type { ContextSource } from "../../core/context-sources.ts";
import type { ExtensionContextLike, ToolResponse } from "../shared.ts";
import { error, ok } from "../shared.ts";

export interface SendTaskParams {
  sessionId: string;
  taskId: string;
  inputText: string;
  temporarySources?: ContextSource[];
  archiveEnabled?: boolean;
  metadata?: Record<string, unknown>;
}

export interface SendTaskDeps extends SessionTaskRunnerDeps {
  scheduler: TaskScheduler;
}

export async function handleSendTask(
  params: SendTaskParams,
  ctx: ExtensionContextLike,
  deps?: Partial<SendTaskDeps>,
): Promise<ToolResponse> {
  try {
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

    const task = await createSessionTask(ctx.cwd, params.sessionId, {
      taskId: params.taskId,
      inputText: params.inputText,
      ...(params.temporarySources ? { temporarySources: params.temporarySources } : {}),
      ...(params.archiveEnabled !== undefined ? { archiveEnabled: params.archiveEnabled } : {}),
      ...(params.metadata ? { metadata: params.metadata } : {}),
    });
    await appendSessionEvent(ctx.cwd, params.sessionId, {
      taskId: task.id,
      type: "task_registered",
      payload: { inputText: params.inputText },
    });

    const registeredAt = Date.now();
    const { queuePosition } = scheduler.enqueue({
      taskId: task.id,
      sessionId: params.sessionId,
      registeredAt,
      execute: async () => {
        await updateSessionTask(ctx.cwd, params.sessionId, task.id, current => ({
          ...(() => {
            const { queuePosition: _queuePosition, ...rest } = current;
            return rest;
          })(),
          status: "running",
          startedAt: new Date().toISOString(),
        } as SessionTaskRecord));
        await appendSessionEvent(ctx.cwd, params.sessionId, {
          taskId: task.id,
          type: "task_started",
          payload: {},
        });
        try {
          const result = await executeSessionTask(ctx.cwd, params.sessionId, task, ctx, runtimeDeps);
          await updateSessionTask(ctx.cwd, params.sessionId, task.id, current => ({
            ...(() => {
              const { queuePosition: _queuePosition, ...rest } = current;
              return rest;
            })(),
            status: "completed",
            model: result.model,
            tools: result.tools,
            finishedAt: new Date().toISOString(),
          } as SessionTaskRecord));
          await appendSessionEvent(ctx.cwd, params.sessionId, {
            taskId: task.id,
            type: "task_completed",
            payload: {
              model: result.model,
              tools: result.tools,
            },
          });
        } catch (err) {
          await updateSessionTask(ctx.cwd, params.sessionId, task.id, current => ({
            ...(() => {
              const { queuePosition: _queuePosition, ...rest } = current;
              return rest;
            })(),
            status: "failed",
            errorMessage: (err as Error).message,
            finishedAt: new Date().toISOString(),
          } as SessionTaskRecord));
          await appendSessionEvent(ctx.cwd, params.sessionId, {
            taskId: task.id,
            type: "task_failed",
            payload: {
              error: (err as Error).message,
            },
          });
        }
      },
    });

    await updateSessionTask(ctx.cwd, params.sessionId, task.id, current => ({
      ...current,
      queuePosition,
    }));
    await appendSessionEvent(ctx.cwd, params.sessionId, {
      taskId: task.id,
      type: "task_queued",
      payload: { queuePosition, registeredAt },
    });

    const currentTask = await getSessionTask(ctx.cwd, params.sessionId, task.id);
    return ok(JSON.stringify({ task: currentTask }, null, 2), { task: currentTask });
  } catch (err) {
    return error(`Error sending task: ${(err as Error).message}`);
  }
}

export async function handleGetTask(
  params: { sessionId: string; taskId: string },
  ctx: ExtensionContextLike,
): Promise<ToolResponse> {
  try {
    const task = await getSessionTask(ctx.cwd, params.sessionId, params.taskId);
    if (!task) {
      return error(`Task not found: ${params.taskId}`);
    }
    return ok(JSON.stringify({ task }, null, 2), { task });
  } catch (err) {
    return error(`Error getting task: ${(err as Error).message}`);
  }
}

export async function handleListTasks(
  params: { sessionId?: string },
  ctx: ExtensionContextLike,
): Promise<ToolResponse> {
  try {
    const tasks = params.sessionId
      ? await readTasks(ctx.cwd, params.sessionId)
      : (await Promise.all((await listSessions(ctx.cwd)).map(session => readTasks(ctx.cwd, session.sessionId)))).flat();
    return ok(JSON.stringify({ tasks }, null, 2), { tasks });
  } catch (err) {
    return error(`Error listing tasks: ${(err as Error).message}`);
  }
}
