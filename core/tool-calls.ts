import { readJsonl, appendJsonl, updateJsonl } from "../utils/jsonl.ts";
import type { ToolCallInput, ToolCallRecord, ToolCallFilter } from "./types.ts";

export async function appendToolCall(
  tablePath: string,
  id: string,
  call: ToolCallInput,
): Promise<ToolCallRecord> {
  const record: ToolCallRecord = {
    id,
    turnId: call.turnId,
    toolName: call.toolName,
    params: call.params,
    content: call.content,
    details: call.details ?? {},
    truncated: call.truncated ?? false,
    error: call.error ?? false,
    durationMs: call.durationMs ?? 0,
  };
  await appendJsonl(tablePath, record);
  return record;
}

export async function getToolCall(
  tablePath: string,
  id: string,
): Promise<ToolCallRecord | null> {
  const records = await readJsonl<ToolCallRecord>(tablePath);
  return records.find(r => r.id === id) ?? null;
}

export async function queryToolCalls(
  tablePath: string,
  filter: ToolCallFilter,
): Promise<ToolCallRecord[]> {
  let records = await readJsonl<ToolCallRecord>(tablePath);
  if (filter.ids && filter.ids.length > 0) {
    const idSet = new Set(filter.ids);
    records = records.filter(r => idSet.has(r.id));
  }
  if (filter.turnId) {
    records = records.filter(r => r.turnId === filter.turnId);
  }
  if (filter.toolName) {
    records = records.filter(r => r.toolName === filter.toolName);
  }
  return records;
}

export async function updateToolCall(
  tablePath: string,
  id: string,
  patch: Partial<ToolCallRecord>,
): Promise<boolean> {
  return updateJsonl<ToolCallRecord>(tablePath, id, patch);
}
