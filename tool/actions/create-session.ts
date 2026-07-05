import {
  createSession,
  createSessionLayout,
  listSessions,
  readSessionConfig,
  type SessionSdkMode,
  type StandaloneSdkOptions,
} from "../../core/session-store.ts";
import type { SubagentModelSelection, SubagentToolSelection } from "../../core/subagent-run.ts";
import type { ExtensionContextLike, ToolResponse } from "../shared.ts";
import { error, ok } from "../shared.ts";

export interface CreateSessionParams {
  sessionId: string;
  systemPromptFilePaths: string[];
  sdkMode: SessionSdkMode;
  modelSelection?: SubagentModelSelection;
  tools?: SubagentToolSelection;
  sdkOptions?: StandaloneSdkOptions;
}

export async function handleCreateSession(
  params: CreateSessionParams,
  ctx: ExtensionContextLike,
): Promise<ToolResponse> {
  try {
    const result = await createSession(ctx.cwd, params);
    return ok(`Created session: ${params.sessionId}`, {
      session: result.config,
      layout: result.layout,
    });
  } catch (err) {
    return error(`Error creating session: ${(err as Error).message}`);
  }
}

export async function handleGetSession(
  params: { sessionId: string },
  ctx: ExtensionContextLike,
): Promise<ToolResponse> {
  try {
    const config = await readSessionConfig(ctx.cwd, params.sessionId);
    const { listContextMounts, readCurrentContextState } = await import("../../core/session-store.ts");
    const activeMounts = await listContextMounts(ctx.cwd, params.sessionId);
    const currentState = await readCurrentContextState(ctx.cwd, params.sessionId);
    return ok(JSON.stringify({
      session: config,
      activeMounts,
      activeMessageIds: currentState.activeMessageIds,
      layout: createSessionLayout(ctx.cwd, params.sessionId),
    }, null, 2), { session: config, activeMounts, activeMessageIds: currentState.activeMessageIds });
  } catch (err) {
    return error(`Error getting session: ${(err as Error).message}`);
  }
}

export async function handleListSessions(
  _params: Record<string, unknown>,
  ctx: ExtensionContextLike,
): Promise<ToolResponse> {
  try {
    const sessions = await listSessions(ctx.cwd);
    return ok(JSON.stringify({ sessions }, null, 2), { sessions });
  } catch (err) {
    return error(`Error listing sessions: ${(err as Error).message}`);
  }
}
