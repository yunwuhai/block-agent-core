// tool/dialogue-memory.ts
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext, ToolCallEvent } from "@earendil-works/pi-coding-agent";
import { handleLoad } from "./actions/load.ts";
import { handleSave } from "./actions/save.ts";
import { handleQuery } from "./actions/query.ts";
import { handleManage } from "./actions/manage.ts";
import { checkRead, checkWrite } from "./permissions.ts";

export function registerDialogueMemoryTool(pi: ExtensionAPI): void {
  // -----------------------------------------------------------------------
  // File-level permission sandbox: intercept read / write / edit tool calls
  // and enforce template allowReadPaths / allowWritePaths / denyPaths.
  // -----------------------------------------------------------------------
  pi.on("tool_call", (event: ToolCallEvent) => {
    // Only intercept file-access tools; bash is deliberately not handled.
    if (
      event.toolName === "read" ||
      event.toolName === "write" ||
      event.toolName === "edit"
    ) {
      const input = event.input as { path?: string };
      if (input.path) {
        const result =
          event.toolName === "read"
            ? checkRead(input.path)
            : checkWrite(input.path);
        if (!result.allowed) {
          return { block: true, ...(result.reason ? { reason: result.reason } : {}) };
        }
      }
    }
    return;
  });

  pi.registerTool({
    name: "dialogue_memory",
    label: "Dialogue Memory",
    description: `对话记忆数据库——管理跨会话的对话历史、模板提示词、组装方案。

支持的操作：
- load: 加载上下文（根据组装方案和调用记录拼装提示词）
- save: 保存当前轮次（写入 .md 文件 + 各记录表追加）
- query: 查询记录（按 tags/turnId/toolName 等条件过滤）
- manage: 管理记录（get/append/update/delete 单条记录）

所有文件路径需要显式传入——库不管理目录结构。`,

    parameters: Type.Object({
      action: StringEnum(["load", "save", "query", "manage"] as const),

      recipePath: Type.Optional(Type.String()),
      recipeId: Type.Optional(Type.String()),
      callRecordPath: Type.Optional(Type.String()),

      turnsPath: Type.Optional(Type.String()),
      turnMdPath: Type.Optional(Type.String()),
      toolsPath: Type.Optional(Type.String()),
      refsPath: Type.Optional(Type.String()),
      callRecordsPath: Type.Optional(Type.String()),
      turnId: Type.Optional(Type.String()),
      toolCallIds: Type.Optional(Type.Array(Type.String())),
      refIds: Type.Optional(Type.Array(Type.String())),
      callRecordId: Type.Optional(Type.String()),
      turn: Type.Optional(Type.Object({})),
      toolCalls: Type.Optional(Type.Array(Type.Object({}))),
      fileRefs: Type.Optional(Type.Array(Type.Object({}))),
      callRecord: Type.Optional(Type.Object({})),

      table: Type.Optional(StringEnum([
        "turns", "toolCalls", "templates",
        "fileRefs", "callRecords", "recipes",
      ] as const)),
      tablePath: Type.Optional(Type.String()),
      filter: Type.Optional(Type.Object({})),
      op: Type.Optional(StringEnum([
        "get", "append", "update", "delete",
      ] as const)),
      id: Type.Optional(Type.String()),
      data: Type.Optional(Type.Object({})),
    }) as any,

    async execute(
      _toolCallId: string,
      params: Record<string, unknown>,
      _signal: AbortSignal | undefined,
      _onUpdate: ((update: any) => void) | undefined,
      ctx: ExtensionContext,
    ) {
      const action = params.action as string;
      switch (action) {
        case "load":
          return handleLoad(params as unknown as Parameters<typeof handleLoad>[0], ctx);
        case "save":
          return handleSave(params as unknown as Parameters<typeof handleSave>[0], ctx);
        case "query":
          return handleQuery(params as unknown as Parameters<typeof handleQuery>[0], ctx);
        case "manage":
          return handleManage(params as unknown as Parameters<typeof handleManage>[0], ctx);
        default:
          return {
            content: [{ type: "text" as const, text: `Unknown action: ${action}. Use load, save, query, or manage.` }],
            details: {} as any,
          };
      }
    },
  });
}
