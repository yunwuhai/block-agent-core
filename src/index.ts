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
export { nowIso } from "./utils/datetime.ts";
export { toNumberRanges, fromNumberRanges, normalizeRanges } from "./utils/range-utils.ts";
export { buildChildrenMap, collectDescendantIds, removeIdsAndDescendants } from "./session/message-tree.ts";
export {
  normalizeToolNames,
  PI_BUILTIN_TOOLS,
  PI_DEFAULT_SUBAGENT_TOOLS,
  usesOnlyBuiltinTools,
} from "./session/subagent-run.ts";
export {
  composeContext,
  createContextLoaderRegistry,
  loadContextSource,
  loadContextSources,
  loadFileSliceSource,
  loadJsonlFieldsSource,
} from "./session/context-sources.ts";
export {
  getCurrentParentSequence,
  listContextMounts,
  mountContext,
  readCurrentContextState,
  readLatestSendSnapshot,
  unmountContext,
} from "./session/context-state.ts";
export {
  allocateTurnId,
  appendSessionEvent,
  appendSessionMessage,
  createSession,
  createSessionLayout,
  createSessionsRootDir,
  listSessions,
  readEvents,
  readMessages,
  readSessionConfig,
  updateSessionConfig,
  writeSessionConfig,
} from "./session/store.ts";
export type * from "./session/types.ts";
export type * from "./session/context-state.ts";
export {
  createInputMessage,
  executeSessionTask,
} from "./session/runtime.ts";
export {
  getDefaultTaskScheduler,
  TaskScheduler,
} from "./session/task-scheduler.ts";
export {
  buildSubagentInvocation,
  buildSubagentPrompt,
} from "./session/pi-config.ts";
export {
  appendMessageRecord,
  createArchiveLayout,
  createDefaultArchiveRootDir,
  registerExternalFileAccess,
  saveSubagentResult,
} from "./session/archive-store.ts";
export {
  importPiModelRegistryFromStandalone,
  listPiModels,
  resolvePiModel,
  runSubagentWithPiSdk,
} from "./adapter/pi-sdk.ts";
export type * from "./session/context-sources.ts";
export type * from "./session/pi-config.ts";
export type * from "./session/archive-store.ts";
export type * from "./session/store.ts";
export type * from "./session/subagent-run.ts";
export type * from "./adapter/pi-sdk.ts";
