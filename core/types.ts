// core/types.ts

// ===========================================================================
// ContentBlock — PI-compatible content format
// ===========================================================================

export interface ContentBlock {
  type: "text" | "image";
  text?: string;
  data?: string;
  mimeType?: string;
}

// ===========================================================================
// Turn (单轮对话)
// ===========================================================================

export interface TurnInput {
  /** ## User 后的内容 */
  userText: string;
  /** AI 回复块序列 */
  assistantBlocks: AssistantBlock[];
}

export type AssistantBlock =
  | { type: "text"; text: string }
  | {
      type: "tool";
      toolName: string;
      params: Record<string, unknown>;
      content: ContentBlock[];
      details?: Record<string, unknown>;
      truncated?: boolean;
      error?: boolean;
      durationMs?: number;
    };

export interface TurnRecord {
  id: string;           // turn-NNN
  path: string;         // 指向 .md 文件
  handoff: string;      // 内容摘要
  tags: string[];       // 标签
}

export interface TurnFilter {
  tags?: string[];      // 匹配任一标签
  ids?: string[];       // 指定 ID 列表
}

// ===========================================================================
// ToolCall (工具调用)
// ===========================================================================

export interface ToolCallInput {
  turnId: string;
  toolName: string;
  params: Record<string, unknown>;
  content: ContentBlock[];
  details?: Record<string, unknown>;
  truncated?: boolean;
  error?: boolean;
  durationMs?: number;
}

export interface ToolCallRecord {
  id: string;           // call-NNN
  turnId: string;
  toolName: string;
  params: Record<string, unknown>;
  content: ContentBlock[];
  details: Record<string, unknown>;
  truncated: boolean;
  error: boolean;
  durationMs: number;
}

export interface ToolCallFilter {
  turnId?: string;
  toolName?: string;
  ids?: string[];
}

// ===========================================================================
// Template (模板提示词)
// ===========================================================================

export interface TemplateInput {
  path: string;              // 指向 .md 文件
  tags?: string[];
  allowReadPaths?: string[];
  allowWritePaths?: string[];
  denyPaths?: string[];
  allowBash?: boolean;
}

export interface TemplateRecord {
  id: string;                // tmpl-NNN
  path: string;
  tags: string[];
  allowReadPaths: string[];
  allowWritePaths: string[];
  denyPaths: string[];
  allowBash: boolean;
}

export interface TemplateFilter {
  tags?: string[];
  ids?: string[];
}

// ===========================================================================
// FileRef (文件引用)
// ===========================================================================

export interface FileRefInput {
  filePath: string;
  turnId: string;
  toolCallId: string;
  accessType: "read" | "write";
  handoff?: string;
}

export interface FileRefRecord {
  id: string;           // ref-NNN
  filePath: string;
  turnId: string;
  toolCallId: string;
  accessType: "read" | "write";
  handoff: string;
}

export interface FileRefFilter {
  turnId?: string;
  filePath?: string;   // glob 匹配
  accessType?: "read" | "write";
  ids?: string[];
}

// ===========================================================================
// CallRecord (单轮调用记录)
// ===========================================================================

export interface CallRecordInput {
  turnId: string;
  recipeId: string;
  zones: Record<string, Ref[]>;
}

export interface CallRecord {
  id: string;           // rec-NNN
  turnId: string;
  recipeId: string;
  zones: Record<string, Ref[]>;
}

export interface CallRecordFilter {
  turnId?: string;
  recipeId?: string;
  ids?: string[];
}

// ===========================================================================
// Ref — 指向某条记录某个加载方式的引用
// ===========================================================================

export interface Ref {
  /** 记录表文件路径（用于消歧 ID 重复） */
  file: string;
  /** 记录 ID */
  id: string;
  /** 加载模式，默认 full */
  mode?: "full" | "handoff";
  /** 按行范围加载，如 "1-80" */
  lines?: string;
}

// ===========================================================================
// Recipe (组装方案)
// ===========================================================================

export interface Recipe {
  id: string;
  name: string;
  description: string;
  zones: Zone[];
}

export interface Zone {
  name: string;
  description: string;
  position: "before" | "after";
  separator?: string;
  separator_before?: string;
  separator_after?: string;
}

/** TOML 文件的顶层结构 */
export interface RecipesFile {
  recipes: Recipe[];
}

// ===========================================================================
// SavedTurn — saveTurn 的返回值
// ===========================================================================

export interface SavedTurn {
  turnMdPath: string;
  turnRecord: TurnRecord;
  toolCallRecords: ToolCallRecord[];
  fileRefRecords: FileRefRecord[];
  callRecord: CallRecord;
}
