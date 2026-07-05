// index.ts
// ===========================================================================
// Block Agent Core
//
// 双导出：
//   - 默认导出: PI 扩展工厂，注册 block_agent_core 工具
//   - 命名导出: 可复用核心能力（context assembly / PI SDK adapter / archive）
// ===========================================================================

// Default export: PI extension - lazily imports PI modules
export default async function (pi: import("@earendil-works/pi-coding-agent").ExtensionAPI): Promise<void> {
  const { registerBlockAgentCoreTool } = await import("./tool/block-agent-core.ts");
  registerBlockAgentCoreTool(pi);
}

// Named exports: reusable core API
export { appendTurn, getTurn, queryTurns, updateTurn, listTurns, findRecentTurns } from "./core/turns.ts";
export { appendToolCall, getToolCall, queryToolCalls, updateToolCall } from "./core/tool-calls.ts";
export { appendTemplate, getTemplate, queryTemplates, updateTemplate } from "./core/templates.ts";
export { appendFileRef, getFileRef, queryFileRefs, updateFileRef } from "./core/file-refs.ts";
export { appendCallRecord, getCallRecord, queryCallRecords, updateCallRecord } from "./core/call-records.ts";
export { loadRecipes, getRecipe, addRecipe, updateRecipe } from "./core/recipes.ts";
export { buildPrompt, buildPromptFromRecipe } from "./core/build-prompt.ts";
export { saveTurn } from "./core/save-turn.ts";
export {
  normalizeToolNames,
  PI_BUILTIN_TOOLS,
  PI_DEFAULT_SUBAGENT_TOOLS,
  usesOnlyBuiltinTools,
} from "./core/subagent-run.ts";
export {
  composeContext,
  createContextLoaderRegistry,
  loadContextSource,
  loadContextSources,
  loadFileSliceSource,
  loadJsonlFieldsSource,
} from "./core/context-sources.ts";
export {
  appendSessionEvent,
  appendSessionFileCall,
  appendSessionMessage,
  appendSessionToolCall,
  compressMessageSequences,
  createSession,
  createSessionLayout,
  createSessionsRootDir,
  expandMessageSequenceRanges,
  getCurrentParentSequence,
  getNextMessageSequence,
  listContextMounts,
  listSessions,
  mountContext,
  readCurrentContextState,
  readEvents,
  readFileCalls,
  readLatestSendSnapshot,
  readMessages,
  readSessionConfig,
  readToolCalls,
  unmountContext,
  updateSessionConfig,
  writeSessionConfig,
} from "./core/session-store.ts";
export {
  createInputMessage,
  executeSessionTask,
} from "./core/session-runtime.ts";
export {
  getDefaultTaskScheduler,
  TaskScheduler,
} from "./core/task-scheduler.ts";
export {
  buildSubagentInvocation,
  buildSubagentPrompt,
} from "./core/pi-config.ts";
export {
  appendMessageRecord,
  createArchiveLayout,
  createDefaultArchiveRootDir,
  registerExternalFileAccess,
  saveSubagentResult,
} from "./core/archive-store.ts";
export {
  importPiModelRegistryFromStandalone,
  listPiModels,
  resolvePiModel,
  runSubagentWithPiSdk,
} from "./adapter/pi-sdk.ts";
export type * from "./core/types.ts";
export type * from "./core/context-sources.ts";
export type * from "./core/pi-config.ts";
export type * from "./core/archive-store.ts";
export type * from "./core/session-store.ts";
export type * from "./core/subagent-run.ts";
export type * from "./adapter/pi-sdk.ts";
