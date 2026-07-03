import { createCrudModule } from "./crud-factory.ts";
import type { CallRecordInput, CallRecord, CallRecordFilter } from "./types.ts";

// ---------------------------------------------------------------------------
// CRUD factory — replaces the previous inline append/get/query/update
// ---------------------------------------------------------------------------
const crud = createCrudModule<CallRecord, CallRecordInput, CallRecordFilter>(
  "call-record",
  (id, input) => ({
    id,
    turnId: input.turnId,
    recipeId: input.recipeId,
    zones: input.zones,
  }),
  (record, filter) => {
    if (filter.turnId && record.turnId !== filter.turnId) return false;
    if (filter.recipeId && record.recipeId !== filter.recipeId) return false;
    return true;
  },
);

export async function appendCallRecord(
  tablePath: string,
  id: string,
  rec: CallRecordInput,
): Promise<CallRecord> {
  return crud.append(tablePath, id, rec);
}

export async function getCallRecord(
  tablePath: string,
  id: string,
): Promise<CallRecord | null> {
  return crud.get(tablePath, id);
}

export async function queryCallRecords(
  tablePath: string,
  filter: CallRecordFilter,
): Promise<CallRecord[]> {
  return crud.query(tablePath, filter);
}

export async function updateCallRecord(
  tablePath: string,
  id: string,
  patch: Partial<CallRecord>,
): Promise<boolean> {
  return crud.update(tablePath, id, patch);
}
