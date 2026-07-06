// session/types.ts
// Session 系统核心类型定义
// 从 session-store.ts 拆分——只包含类型，无运行时逻辑

import type { ContextSource } from "./context-sources.ts";
import type { SubagentModelSelection, SubagentToolSelection } from "./subagent-run.ts";

// ===========================================================================
// Session 模式
// ===========================================================================

export type SessionSdkMode = "host-inherit" | "standalone-sdk";
export type SessionMessageKind = "input" | "reasoning" | "reply" | "tool_call";

// ===========================================================================
// 独立 SDK 选项（standalone-sdk 模式）
// ===========================================================================

export interface StandaloneSdkOptions {
  sdkModulePath?: string;
  authStoragePath?: string;
  currentModel?: {
    provider: string;
    modelId: string;
    displayName?: string;
    reasoning?: boolean;
    input?: string[];
  };
}

// ===========================================================================
// 上下文挂载
// ===========================================================================

export interface ContextMount {
  id: number;
  sources?: ContextSource[];
  idRanges?: number[][];
  metadata?: Record<string, unknown>;
}

// ===========================================================================
// Session 系统配置
// ===========================================================================

export interface SessionSystemConfig {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  systemPromptFilePaths: string[];
  systemPromptText: string;
  sdkMode: SessionSdkMode;
  nextTurnId: number;
  modelSelection?: SubagentModelSelection;
  tools?: SubagentToolSelection;
  sdkOptions?: StandaloneSdkOptions;
}

// ===========================================================================
// Session 消息记录
// ===========================================================================

export interface SessionMessageRecord {
  turnId?: number;
  id: number;
  kind: SessionMessageKind;
  text?: string;
  parentId?: number;
  // inline tool call data (kind === "tool_call")
  toolName?: string;
  toolParams?: unknown;
  toolResult?: unknown;
  toolError?: boolean;
  startedAt?: string;
  finishedAt?: string;
  // per-turn token usage (kind === "reply")
  usage?: { inputTokens?: number; outputTokens?: number };
  // per-turn execution duration in ms (kind === "reply")
  durationMs?: number;
  tags?: string[];
  handoff?: string;
  metadata?: Record<string, unknown>;
}

// ===========================================================================
// Session 事件记录
// ===========================================================================

export interface SessionEventRecord {
  turnId?: number;
  id: number;
  type: string;
  createdAt: string;
  payload: Record<string, unknown>;
}

// ===========================================================================
// Session 文件布局
// ===========================================================================

export interface SessionLayout {
  rootDir: string;
  messagesPath: string;
  systemConfigPath: string;
  eventsPath: string;
}

// ===========================================================================
// 创建 Session 的输入参数
// ===========================================================================

export interface CreateSessionInput {
  sessionId: string;
  systemPromptFilePaths: string[];
  sdkMode: SessionSdkMode;
  modelSelection?: SubagentModelSelection;
  tools?: SubagentToolSelection;
  sdkOptions?: StandaloneSdkOptions;
}
