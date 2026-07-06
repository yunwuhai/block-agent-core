import { appendSessionMessage } from "../../session/store.ts";
import type { SessionMessageRecord } from "../../session/types.ts";
import type { ExtensionContextLike, ToolResponse } from "../shared.ts";
import { error, ok } from "../shared.ts";

export interface ArchiveSessionParams {
  sessionId: string;
  messages?: Array<Partial<SessionMessageRecord> & { kind: string }>;
}

export async function handleArchiveSession(
  params: ArchiveSessionParams,
  ctx: ExtensionContextLike,
): Promise<ToolResponse> {
  try {
    for (const message of params.messages ?? []) {
      await appendSessionMessage(ctx.cwd, params.sessionId, {
        ...(message.id !== undefined ? { id: message.id } : {}),
        kind: message.kind as SessionMessageRecord["kind"],
        ...(message.parentId !== undefined ? { parentId: message.parentId } : {}),
        ...(message.turnId !== undefined ? { turnId: message.turnId } : {}),
        ...(message.text !== undefined ? { text: message.text } : {}),
        ...(message.toolName !== undefined ? { toolName: message.toolName } : {}),
        ...(message.toolParams !== undefined ? { toolParams: message.toolParams } : {}),
        ...(message.toolResult !== undefined ? { toolResult: message.toolResult } : {}),
        ...(message.toolError !== undefined ? { toolError: message.toolError } : {}),
        ...(message.tags ? { tags: message.tags } : {}),
        ...(message.handoff ? { handoff: message.handoff } : {}),
        ...(message.metadata ? { metadata: message.metadata } : {}),
      });
    }

    return ok(`Archived session data for ${params.sessionId}`);
  } catch (err) {
    return error(`Error archiving session: ${(err as Error).message}`);
  }
}
