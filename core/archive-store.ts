import { mkdir, writeFile } from "node:fs/promises";
import { renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { appendJsonl } from "../utils/jsonl.ts";

export interface ArchiveLayout {
  rootDir: string;
  messagesPath: string;
  toolCallsDir: string;
  externalFilesPath: string;
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

export function createArchiveLayout(rootDir: string): ArchiveLayout {
  return {
    rootDir,
    messagesPath: join(rootDir, "messages.jsonl"),
    toolCallsDir: join(rootDir, "tool-calls"),
    externalFilesPath: join(rootDir, "external-files.jsonl"),
  };
}

async function writeToolCallTrace(toolCallsDir: string, trace: ToolCallTrace): Promise<string> {
  await mkdir(toolCallsDir, { recursive: true });
  const outputPath = join(toolCallsDir, `${trace.id}.json`);
  const tmpPath = `${outputPath}.tmp`;
  await writeFile(tmpPath, JSON.stringify(trace, null, 2) + "\n", "utf-8");
  renameSync(tmpPath, outputPath);
  return outputPath;
}

export async function appendMessageRecord(
  messagesPath: string,
  record: MessageRecord,
): Promise<void> {
  await appendJsonl(messagesPath, record);
}

export async function registerExternalFileAccess(
  externalFilesPath: string,
  record: ExternalFileAccessRecord,
): Promise<void> {
  await appendJsonl(externalFilesPath, record);
}

export async function saveSubagentResult(
  layout: ArchiveLayout,
  input: SaveSubagentResultInput,
): Promise<{ toolCallPaths: string[] }> {
  await mkdir(dirname(layout.messagesPath), { recursive: true });

  for (const message of input.messages ?? []) {
    await appendMessageRecord(layout.messagesPath, message);
  }

  const toolCallPaths: string[] = [];
  for (const toolCall of input.toolCalls ?? []) {
    toolCallPaths.push(await writeToolCallTrace(layout.toolCallsDir, toolCall));
  }

  for (const externalFile of input.externalFiles ?? []) {
    await registerExternalFileAccess(layout.externalFilesPath, externalFile);
  }

  return { toolCallPaths };
}
