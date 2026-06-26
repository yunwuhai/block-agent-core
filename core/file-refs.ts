// core/file-refs.ts
import { readJsonl, appendJsonl, updateJsonl } from "../utils/jsonl.ts";
import { matchGlob } from "../utils/glob.ts";
import type { FileRefInput, FileRefRecord, FileRefFilter } from "./types.ts";

export async function appendFileRef(
  tablePath: string,
  id: string,
  ref: FileRefInput,
): Promise<FileRefRecord> {
  const record: FileRefRecord = {
    id,
    filePath: ref.filePath,
    turnId: ref.turnId,
    toolCallId: ref.toolCallId,
    accessType: ref.accessType,
    handoff: ref.handoff ?? "",
  };
  await appendJsonl(tablePath, record);
  return record;
}

export async function getFileRef(
  tablePath: string,
  id: string,
): Promise<FileRefRecord | null> {
  const records = await readJsonl<FileRefRecord>(tablePath);
  return records.find(r => r.id === id) ?? null;
}

export async function queryFileRefs(
  tablePath: string,
  filter: FileRefFilter,
): Promise<FileRefRecord[]> {
  let records = await readJsonl<FileRefRecord>(tablePath);
  if (filter.ids && filter.ids.length > 0) {
    const idSet = new Set(filter.ids);
    records = records.filter(r => idSet.has(r.id));
  }
  if (filter.turnId) {
    records = records.filter(r => r.turnId === filter.turnId);
  }
  if (filter.accessType) {
    records = records.filter(r => r.accessType === filter.accessType);
  }
  if (filter.filePath) {
    records = records.filter(r => matchGlob(filter.filePath!, r.filePath));
  }
  return records;
}

export async function updateFileRef(
  tablePath: string,
  id: string,
  patch: Partial<FileRefRecord>,
): Promise<boolean> {
  return updateJsonl<FileRefRecord>(tablePath, id, patch);
}
