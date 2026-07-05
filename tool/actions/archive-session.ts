import {
  appendSessionFileCall,
  appendSessionMessage,
  appendSessionToolCall,
  type SessionFileCallRecord,
  type SessionMessageRecord,
  type SessionToolCallRecord,
} from "../../core/session-store.ts";
import type { ExtensionContextLike, ToolResponse } from "../shared.ts";
import { error, ok } from "../shared.ts";

export interface ArchiveSessionParams {
  sessionId: string;
  messages?: Array<Partial<SessionMessageRecord> & { kind: string }>;
  toolCalls?: Array<Partial<SessionToolCallRecord> & { toolName: string }>;
  fileCalls?: Array<Partial<SessionFileCallRecord> & { filePath: string }>;
}

export async function handleArchiveSession(
  params: ArchiveSessionParams,
  ctx: ExtensionContextLike,
): Promise<ToolResponse> {
  try {
    for (const message of params.messages ?? []) {
      await appendSessionMessage(ctx.cwd, params.sessionId, {
        ...(message.seq !== undefined ? { seq: message.seq } : {}),
        kind: message.kind as SessionMessageRecord["kind"],
        ...(message.parentSeq !== undefined ? { parentSeq: message.parentSeq } : {}),
        ...(message.requestKey ? { requestKey: message.requestKey } : {}),
        ...(message.text !== undefined ? { text: message.text } : {}),
        ...(message.toolCallSeq !== undefined ? { toolCallSeq: message.toolCallSeq } : {}),
        ...(message.fileCallSeq !== undefined ? { fileCallSeq: message.fileCallSeq } : {}),
        ...(message.tags ? { tags: message.tags } : {}),
        ...(message.handoff ? { handoff: message.handoff } : {}),
        ...(message.metadata ? { metadata: message.metadata } : {}),
      });
    }

    for (const toolCall of params.toolCalls ?? []) {
      await appendSessionToolCall(ctx.cwd, params.sessionId, {
        ...(toolCall.seq !== undefined ? { seq: toolCall.seq } : {}),
        ...(toolCall.requestKey ? { requestKey: toolCall.requestKey } : {}),
        toolName: toolCall.toolName,
        params: toolCall.params ?? {},
        result: toolCall.result ?? null,
        ...(toolCall.error !== undefined ? { error: toolCall.error } : {}),
        ...(toolCall.metadata ? { metadata: toolCall.metadata } : {}),
      });
    }

    for (const fileCall of params.fileCalls ?? []) {
      await appendSessionFileCall(ctx.cwd, params.sessionId, {
        ...(fileCall.seq !== undefined ? { seq: fileCall.seq } : {}),
        filePath: fileCall.filePath,
        ...(fileCall.requestKey ? { requestKey: fileCall.requestKey } : {}),
        ...(fileCall.metadata ? { metadata: fileCall.metadata } : {}),
      });
    }

    return ok(`Archived session data for ${params.sessionId}`);
  } catch (err) {
    return error(`Error archiving session: ${(err as Error).message}`);
  }
}
