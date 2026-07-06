import {
  createSessionLayout,
  updateSessionConfig,
  type SessionSdkMode,
  type StandaloneSdkOptions,
} from "../../core/session-store.ts";
import type { SubagentModelSelection, SubagentToolSelection } from "../../core/subagent-run.ts";
import type { ExtensionContextLike, ToolResponse } from "../shared.ts";
import { error, ok } from "../shared.ts";

export interface UpdateSessionParams {
  sessionId: string;
  systemPromptFilePaths?: string[];
  sdkMode?: SessionSdkMode;
  modelSelection?: SubagentModelSelection;
  tools?: SubagentToolSelection;
  sdkOptions?: StandaloneSdkOptions;
}

export async function handleUpdateSession(
  params: UpdateSessionParams,
  ctx: ExtensionContextLike,
): Promise<ToolResponse> {
  try {
    const session = await updateSessionConfig(ctx.cwd, params.sessionId, {
      ...(params.systemPromptFilePaths ? { systemPromptFilePaths: params.systemPromptFilePaths } : {}),
      ...(params.sdkMode ? { sdkMode: params.sdkMode } : {}),
      ...(params.modelSelection ? { modelSelection: params.modelSelection } : {}),
      ...(params.tools ? { tools: params.tools } : {}),
      ...(params.sdkOptions ? { sdkOptions: params.sdkOptions } : {}),
    });
    return ok(JSON.stringify({
      session,
      layout: createSessionLayout(ctx.cwd, params.sessionId),
    }, null, 2), { session });
  } catch (err) {
    return error(`Error updating session: ${(err as Error).message}`);
  }
}
