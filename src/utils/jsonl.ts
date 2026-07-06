import { appendFile, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync, renameSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Read all records from a JSONL file.
 * Returns empty array if file does not exist.
 * Malformed lines are silently skipped.
 */
export async function readJsonl<T>(filePath: string): Promise<T[]> {
  if (!existsSync(filePath)) return [];
  const raw = await readFile(filePath, "utf-8");
  const records: T[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(JSON.parse(trimmed) as T);
    } catch {
      // skip malformed lines
    }
  }
  return records;
}

/**
 * Append a single record to a JSONL file.
 * Creates parent directories if needed.
 */
export async function appendJsonl<T>(filePath: string, record: T): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, JSON.stringify(record) + "\n", "utf-8");
}

/**
 * Atomic full rewrite of a JSONL file.
 * Writes to .tmp then renames — guarantees the file on disk is
 * either the complete old content or the complete new content.
 */
export async function writeJsonl<T>(filePath: string, records: T[]): Promise<void> {
  const content = records.length > 0
    ? records.map(r => JSON.stringify(r)).join("\n") + "\n"
    : "";
  await mkdir(dirname(filePath), { recursive: true });
  const tmpPath = filePath + ".tmp";
  await writeFile(tmpPath, content, "utf-8");
  renameSync(tmpPath, filePath);
}

/**
 * Update a single record by id. Returns false if id not found.
 * Uses atomic write internally.
 */
export async function updateJsonl<T extends { id: string }>(
  filePath: string,
  id: string,
  patch: Partial<T>,
): Promise<boolean> {
  const records = await readJsonl<T>(filePath);
  const index = records.findIndex(r => r.id === id);
  if (index === -1) return false;
  records[index] = { ...records[index], ...patch } as T;
  await writeJsonl(filePath, records);
  return true;
}

/**
 * Delete a single record by id. Returns false if id not found.
 * Uses atomic write internally.
 */
export async function deleteJsonl(filePath: string, id: string): Promise<boolean> {
  const records = await readJsonl<{ id: string }>(filePath);
  const filtered = records.filter(r => r.id !== id);
  if (filtered.length === records.length) return false;
  await writeJsonl(filePath, filtered);
  return true;
}
