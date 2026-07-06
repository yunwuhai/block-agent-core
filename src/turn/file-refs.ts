import { createCrudModule } from "./crud-factory.ts";
import { matchGlob } from "../utils/glob.ts";
import type { FileRefInput, FileRefRecord, FileRefFilter } from "./types.ts";

// ---------------------------------------------------------------------------
// CRUD factory — replaces the previous inline append/get/query/update
// ---------------------------------------------------------------------------
const crud = createCrudModule<FileRefRecord, FileRefInput, FileRefFilter>(
  "file-ref",
  (id, input) => ({
    id,
    filePath: input.filePath,
    turnId: input.turnId,
    toolCallId: input.toolCallId,
    accessType: input.accessType,
    handoff: input.handoff ?? "",
  }),
  (record, filter) => {
    if (filter.turnId && record.turnId !== filter.turnId) return false;
    if (filter.accessType && record.accessType !== filter.accessType) return false;
    if (filter.filePath && !matchGlob(filter.filePath, record.filePath)) return false;
    return true;
  },
);

export async function appendFileRef(
  tablePath: string,
  id: string,
  ref: FileRefInput,
): Promise<FileRefRecord> {
  return crud.append(tablePath, id, ref);
}

export async function getFileRef(
  tablePath: string,
  id: string,
): Promise<FileRefRecord | null> {
  return crud.get(tablePath, id);
}

export async function queryFileRefs(
  tablePath: string,
  filter: FileRefFilter,
): Promise<FileRefRecord[]> {
  return crud.query(tablePath, filter);
}

export async function updateFileRef(
  tablePath: string,
  id: string,
  patch: Partial<FileRefRecord>,
): Promise<boolean> {
  return crud.update(tablePath, id, patch);
}
