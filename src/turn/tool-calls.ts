import { createCrudModule } from "./crud-factory.ts";
import type { ToolCallInput, ToolCallRecord, ToolCallFilter } from "./types.ts";

// ---------------------------------------------------------------------------
// CRUD factory — replaces the previous inline append/get/query/update
// ---------------------------------------------------------------------------
const crud = createCrudModule<ToolCallRecord, ToolCallInput, ToolCallFilter>(
  "tool-call",
  (id, input) => ({
    id,
    turnId: input.turnId,
    toolName: input.toolName,
    params: input.params,
    content: input.content,
    details: input.details ?? {},
    truncated: input.truncated ?? false,
    error: input.error ?? false,
    durationMs: input.durationMs ?? 0,
  }),
  (record, filter) => {
    if (filter.turnId && record.turnId !== filter.turnId) return false;
    if (filter.toolName && record.toolName !== filter.toolName) return false;
    return true;
  },
);

export async function appendToolCall(
  tablePath: string,
  id: string,
  call: ToolCallInput,
): Promise<ToolCallRecord> {
  return crud.append(tablePath, id, call);
}

export async function getToolCall(
  tablePath: string,
  id: string,
): Promise<ToolCallRecord | null> {
  return crud.get(tablePath, id);
}

export async function queryToolCalls(
  tablePath: string,
  filter: ToolCallFilter,
): Promise<ToolCallRecord[]> {
  return crud.query(tablePath, filter);
}

export async function updateToolCall(
  tablePath: string,
  id: string,
  patch: Partial<ToolCallRecord>,
): Promise<boolean> {
  return crud.update(tablePath, id, patch);
}
