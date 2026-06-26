import { readJsonl, appendJsonl, updateJsonl } from "../utils/jsonl.ts";
import type { CallRecordInput, CallRecord, CallRecordFilter } from "./types.ts";

export async function appendCallRecord(
  tablePath: string,
  id: string,
  rec: CallRecordInput,
): Promise<CallRecord> {
  const record: CallRecord = {
    id,
    turnId: rec.turnId,
    recipeId: rec.recipeId,
    zones: rec.zones,
  };
  await appendJsonl(tablePath, record);
  return record;
}

export async function getCallRecord(
  tablePath: string,
  id: string,
): Promise<CallRecord | null> {
  const records = await readJsonl<CallRecord>(tablePath);
  return records.find(r => r.id === id) ?? null;
}

export async function queryCallRecords(
  tablePath: string,
  filter: CallRecordFilter,
): Promise<CallRecord[]> {
  let records = await readJsonl<CallRecord>(tablePath);
  if (filter.ids && filter.ids.length > 0) {
    const idSet = new Set(filter.ids);
    records = records.filter(r => idSet.has(r.id));
  }
  if (filter.turnId) {
    records = records.filter(r => r.turnId === filter.turnId);
  }
  if (filter.recipeId) {
    records = records.filter(r => r.recipeId === filter.recipeId);
  }
  return records;
}

export async function updateCallRecord(
  tablePath: string,
  id: string,
  patch: Partial<CallRecord>,
): Promise<boolean> {
  return updateJsonl<CallRecord>(tablePath, id, patch);
}
