export interface HookContext {
  readonly phase: "before_agent" | "after_agent" | "before_tool" | "after_tool";
  readonly profile: string;
  readonly task: string;
  readonly runId: string;
  readonly cwd: string;
  readonly toolName?: string;
  readonly toolArgs?: Record<string, unknown>;
}

export interface HookSessionMessage {
  role: "user" | "assistant";
  content: string;
}

export interface HookResult {
  allowed: boolean;
  reason: string;
  slotContent: string | null;
  modifiedArgs: Record<string, unknown> | null;
  sessionMessage?: HookSessionMessage;
}
