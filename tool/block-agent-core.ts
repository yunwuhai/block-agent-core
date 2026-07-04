import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { handleArchiveSession } from "./actions/archive-session.ts";
import { handleListModels } from "./actions/list-models.ts";
import { handleCreateSession, handleGetSession, handleListSessions } from "./actions/create-session.ts";
import { handleUpdateSession } from "./actions/update-session.ts";
import { handleListContextMounts, handleMountContext, handleUnmountContext } from "./actions/context-mounts.ts";
import { handleGetTask, handleListTasks, handleSendTask } from "./actions/send-task.ts";
import { handleReadEvents } from "./actions/read-events.ts";
import type { ExtensionContextLike } from "./shared.ts";
import { ok } from "./shared.ts";

const passthroughObject = Type.Object({
  type: Type.String(),
}, { additionalProperties: true });

export function registerBlockAgentCoreTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "block_agent_core",
    label: "Block Agent Core",
    description: "Manage persistent agent sessions, queue tasks, read event streams, and inspect model availability.",
    parameters: Type.Object({
      action: Type.String(),
      sessionId: Type.Optional(Type.String()),
      taskId: Type.Optional(Type.String()),
      inputText: Type.Optional(Type.String()),
      systemPromptFilePaths: Type.Optional(Type.Array(Type.String())),
      sdkMode: Type.Optional(Type.Union([Type.Literal("host-inherit"), Type.Literal("standalone-sdk")])),
      sdkOptions: Type.Optional(Type.Object({}, { additionalProperties: true })),
      modelSelection: Type.Optional(Type.Object({
        strategy: Type.String(),
      }, { additionalProperties: true })),
      tools: Type.Optional(Type.Object({
        names: Type.Optional(Type.Array(Type.String())),
      }, { additionalProperties: true })),
      sources: Type.Optional(Type.Array(passthroughObject)),
      temporarySources: Type.Optional(Type.Array(passthroughObject)),
      mountIds: Type.Optional(Type.Array(Type.String())),
      metadata: Type.Optional(Type.Object({}, { additionalProperties: true })),
      messages: Type.Optional(Type.Array(Type.Object({}, { additionalProperties: true }))),
      toolCalls: Type.Optional(Type.Array(Type.Object({}, { additionalProperties: true }))),
      fileCalls: Type.Optional(Type.Array(Type.Object({}, { additionalProperties: true }))),
    }) as any,
    async execute(
      _toolCallId: string,
      params: Record<string, unknown>,
      _signal: AbortSignal | undefined,
      _onUpdate: ((update: any) => void) | undefined,
      rawCtx: any,
    ) {
      const ctx = rawCtx as ExtensionContextLike;
      const action = params.action as string;
      switch (action) {
        case "create_session":
          return handleCreateSession(params as any, ctx);
        case "get_session":
          return handleGetSession(params as any, ctx);
        case "list_sessions":
          return handleListSessions(params as any, ctx);
        case "update_session":
          return handleUpdateSession(params as any, ctx);
        case "mount_context":
          return handleMountContext(params as any, ctx);
        case "unmount_context":
          return handleUnmountContext(params as any, ctx);
        case "list_context_mounts":
          return handleListContextMounts(params as any, ctx);
        case "send_task":
          return handleSendTask(params as any, ctx);
        case "get_task":
          return handleGetTask(params as any, ctx);
        case "list_tasks":
          return handleListTasks(params as any, ctx);
        case "read_events":
          return handleReadEvents(params as any, ctx);
        case "list_models":
          return handleListModels(ctx, params as any);
        case "archive_session":
          return handleArchiveSession(params as any, ctx);
        default:
          return ok(
            `Unknown action: ${action}. Use create_session, get_session, list_sessions, update_session, mount_context, unmount_context, list_context_mounts, send_task, get_task, list_tasks, read_events, list_models, or archive_session.`,
          );
      }
    },
  });
}
