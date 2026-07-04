import { randomUUID } from "node:crypto";
import {
  appendSessionFileCall,
  appendSessionMessage,
  appendSessionToolCall,
  getNextMessageSequence,
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
  fileCalls?: Array<Partial<SessionFileCallRecord> & { filePath: string; accessType: SessionFileCallRecord["accessType"] }>;
}

export async function handleArchiveSession(
  params: ArchiveSessionParams,
  ctx: ExtensionContextLike,
): Promise<ToolResponse> {
  try {
    let nextSequence = await getNextMessageSequence(ctx.cwd, params.sessionId);

    for (const message of params.messages ?? []) {
      await appendSessionMessage(ctx.cwd, params.sessionId, {
        id: message.id ?? `message-${randomUUID()}`,
        sequence: message.sequence ?? nextSequence++,
        kind: message.kind as SessionMessageRecord["kind"],
        ...(message.taskId ? { taskId: message.taskId } : {}),
        ...(message.text !== undefined ? { text: message.text } : {}),
        ...(message.toolCallId ? { toolCallId: message.toolCallId } : {}),
        ...(message.fileCallId ? { fileCallId: message.fileCallId } : {}),
        ...(message.tags ? { tags: message.tags } : {}),
        ...(message.handoff ? { handoff: message.handoff } : {}),
        ...(message.metadata ? { metadata: message.metadata } : {}),
      });
    }

    for (const toolCall of params.toolCalls ?? []) {
      await appendSessionToolCall(ctx.cwd, params.sessionId, {
        id: toolCall.id ?? `tool-${randomUUID()}`,
        taskId: toolCall.taskId ?? "manual-archive",
        toolName: toolCall.toolName,
        params: toolCall.params ?? {},
        result: toolCall.result ?? null,
        ...(toolCall.messageId ? { messageId: toolCall.messageId } : {}),
        ...(toolCall.error !== undefined ? { error: toolCall.error } : {}),
        ...(toolCall.metadata ? { metadata: toolCall.metadata } : {}),
      });
    }

    for (const fileCall of params.fileCalls ?? []) {
      await appendSessionFileCall(ctx.cwd, params.sessionId, {
        id: fileCall.id ?? `file-${randomUUID()}`,
        filePath: fileCall.filePath,
        accessType: fileCall.accessType,
        ...(fileCall.taskId ? { taskId: fileCall.taskId } : {}),
        ...(fileCall.messageId ? { messageId: fileCall.messageId } : {}),
        ...(fileCall.toolCallId ? { toolCallId: fileCall.toolCallId } : {}),
        ...(fileCall.metadata ? { metadata: fileCall.metadata } : {}),
      });
    }

    return ok(`Archived session data for ${params.sessionId}`);
  } catch (err) {
    return error(`Error archiving session: ${(err as Error).message}`);
  }
}
