import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { readJsonl } from "../utils/jsonl.ts";
import { createCrudModule } from "./crud-factory.ts";
import type { TurnInput, TurnRecord, TurnFilter } from "./types.ts";

// ---------------------------------------------------------------------------
// CRUD factory — replaces the previous inline append/get/query/update/list
// ---------------------------------------------------------------------------
const crud = createCrudModule<TurnRecord, TurnInput, TurnFilter>(
  "turn",
  (id, input, extra) => ({
    id,
    path: extra as string,
    handoff: input.userText.slice(0, 80),
    tags: input.tags ?? [],
  }),
  (record, filter) =>
    !filter.tags?.length || record.tags.some(t => filter.tags!.includes(t)),
);

/**
 * Append a new turn record and write the .md file.
 * The turnMdPath is where the .md content will be written (handled separately by the caller).
 */
export async function appendTurn(
  tablePath: string,
  id: string,
  turnMdPath: string,
  turn: TurnInput,
): Promise<TurnRecord> {
  return crud.append(tablePath, id, turn, turnMdPath);
}

/**
 * Get a turn record by ID.
 */
export async function getTurn(
  tablePath: string,
  id: string,
): Promise<TurnRecord | null> {
  return crud.get(tablePath, id);
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
  return crud.query(tablePath, filter);
}

/**
 * Update a turn record's handoff, tags, or path.
 */
export async function updateTurn(
  tablePath: string,
  id: string,
  patch: Partial<TurnRecord>,
): Promise<boolean> {
  return crud.update(tablePath, id, patch);
}

/**
 * List all turn records from a table.
 * Convenience wrapper around queryTurns(tablePath, {}).
 */
export async function listTurns(tablePath: string): Promise<TurnRecord[]> {
  return crud.list(tablePath);
}

// ---------------------------------------------------------------------------
// findRecentTurns is unique to the turn module and not part of the generic
// CRUD pattern, so it remains implemented here directly.
// ---------------------------------------------------------------------------

/**
 * Find the most recent N turn records across all JSONL files in a directory.
 *
 * Scans for `*.jsonl` files under `dirPath`, reads all turns from each file,
 * flattens them into one array (preserving append order within each file,
 * processing files in alphabetical order), and returns the last `limit` entries.
 */
export async function findRecentTurns(
  dirPath: string,
  limit: number,
): Promise<TurnRecord[]> {
  let files: string[];
  try {
    files = (await readdir(dirPath))
      .filter(f => f.endsWith(".jsonl"))
      .map(f => join(dirPath, f))
      .sort();
  } catch {
    return [];
  }

  const allTurns: TurnRecord[] = [];
  for (const file of files) {
    try {
      const records = await readJsonl<TurnRecord>(file);
      allTurns.push(...records);
    } catch {
      // Skip unreadable files
    }
  }

  return allTurns.slice(-limit);
}
