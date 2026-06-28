// index.ts
// ===========================================================================
// 对话记忆数据库 (Dialogue Memory Database)
//
// 双导出：
//   - 默认导出: PI 扩展工厂（动态加载 PI 依赖，保持核心层零 PI）
//   - 命名导出: 核心 CRUD + buildPrompt + saveTurn（零 PI 依赖）
// ===========================================================================

// Default export: PI extension — lazily imports PI modules
export default async function (pi: import("@earendil-works/pi-coding-agent").ExtensionAPI): Promise<void> {
  const { registerDialogueMemoryTool } = await import("./tool/dialogue-memory.ts");
  registerDialogueMemoryTool(pi);
}

// Named exports: core API (zero PI dependency)
export { appendTurn, getTurn, queryTurns, updateTurn, listTurns, findRecentTurns } from "./core/turns.ts";
export { appendToolCall, getToolCall, queryToolCalls, updateToolCall } from "./core/tool-calls.ts";
export { appendTemplate, getTemplate, queryTemplates, updateTemplate } from "./core/templates.ts";
export { appendFileRef, getFileRef, queryFileRefs, updateFileRef } from "./core/file-refs.ts";
export { appendCallRecord, getCallRecord, queryCallRecords, updateCallRecord } from "./core/call-records.ts";
export { loadRecipes, getRecipe, addRecipe, updateRecipe } from "./core/recipes.ts";
export { buildPrompt, buildPromptFromRecipe } from "./core/build-prompt.ts";
export { saveTurn } from "./core/save-turn.ts";
export { setPermissions, clearPermissions, checkRead, checkWrite, getPermissions } from "./tool/permissions.ts";
export type * from "./core/types.ts";
