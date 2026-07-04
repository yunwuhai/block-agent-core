import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { appendJsonl } from "../utils/jsonl.ts";

export interface ArchiveLayout {
  rootDir: string;
  messagesPath: string;
  toolCallsPath: string;
  fileCallsPath: string;
}

export interface ReasoningRecord {
  id: string;
  kind: "reasoning";
  text: string;
  sequence: number;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

export interface ReplyRecord {
  id: string;
  kind: "reply";
  text: string;
  sequence: number;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

export type MessageRecord = ReasoningRecord | ReplyRecord;

export interface ToolCallTrace {
  id: string;
  messageId: string;
  toolName: string;
  params: unknown;
  result: unknown;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

export interface ExternalFileAccessRecord {
  id: string;
  filePath: string;
  accessType: "read" | "write";
  messageId?: string;
  toolCallId?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

export interface SaveSubagentResultInput {
  messages?: MessageRecord[];
  toolCalls?: ToolCallTrace[];
  externalFiles?: ExternalFileAccessRecord[];
}

export function createDefaultArchiveRootDir(baseDir: string, runId: string): string {
  return join(baseDir, ".block-agent-core", "runs", runId);
}

export function createArchiveLayout(rootDir: string): ArchiveLayout {
  return {
    rootDir,
    messagesPath: join(rootDir, "messages.jsonl"),
    toolCallsPath: join(rootDir, "tool-calls.jsonl"),
    fileCallsPath: join(rootDir, "file-calls.jsonl"),
  };
}

export async function appendMessageRecord(
  messagesPath: string,
  record: MessageRecord,
): Promise<void> {
  await appendJsonl(messagesPath, record);
}

export async function registerExternalFileAccess(
  fileCallsPath: string,
  record: ExternalFileAccessRecord,
): Promise<void> {
  await appendJsonl(fileCallsPath, record);
}

export async function saveSubagentResult(
  layout: ArchiveLayout,
  input: SaveSubagentResultInput,
): Promise<{ messagesPath: string; toolCallsPath: string; fileCallsPath: string }> {
  await mkdir(dirname(layout.messagesPath), { recursive: true });

  for (const message of input.messages ?? []) {
    await appendMessageRecord(layout.messagesPath, message);
  }

  for (const toolCall of input.toolCalls ?? []) {
    await appendJsonl(layout.toolCallsPath, toolCall);
  }

  for (const externalFile of input.externalFiles ?? []) {
    await registerExternalFileAccess(layout.fileCallsPath, externalFile);
  }

  return {
    messagesPath: layout.messagesPath,
    toolCallsPath: layout.toolCallsPath,
    fileCallsPath: layout.fileCallsPath,
  };
}
