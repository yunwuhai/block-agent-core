import { readJsonl, appendJsonl, updateJsonl } from "../utils/jsonl.ts";
import type { TurnInput, TurnRecord, TurnFilter } from "./types.ts";

/**
 * Append a new turn record and write the .md file.
 * The turnMdPath is where the .md content will be written (handled separately by the caller).
 */
export async function appendTurn(
  tablePath: string,
  id: string,
  turnMdPath: string,
  _turn: TurnInput,
): Promise<TurnRecord> {
  const record: TurnRecord = {
    id,
    path: turnMdPath,
    handoff: "",
    tags: [],
  };
  await appendJsonl(tablePath, record);
  return record;
}

/**
 * Get a turn record by ID.
 */
export async function getTurn(
  tablePath: string,
  id: string,
): Promise<TurnRecord | null> {
  const records = await readJsonl<TurnRecord>(tablePath);
  return records.find(r => r.id === id) ?? null;
}

/**
 * Query turn records by filter.
 * - tags: match any tag (OR logic)
 * - ids: return only records with these IDs
 */
export async function queryTurns(
  tablePath: string,
  filter: TurnFilter,
): Promise<TurnRecord[]> {
  let records = await readJsonl<TurnRecord>(tablePath);
  if (filter.ids && filter.ids.length > 0) {
    const idSet = new Set(filter.ids);
    records = records.filter(r => idSet.has(r.id));
  }
  if (filter.tags && filter.tags.length > 0) {
    records = records.filter(r =>
      r.tags.some(t => filter.tags!.includes(t)),
    );
  }
  return records;
}

/**
 * Update a turn record's handoff, tags, or path.
 */
export async function updateTurn(
  tablePath: string,
  id: string,
  patch: Partial<TurnRecord>,
): Promise<boolean> {
  return updateJsonl<TurnRecord>(tablePath, id, patch);
}
