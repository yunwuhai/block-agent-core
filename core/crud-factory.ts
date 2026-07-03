// core/crud-factory.ts
// Generic CRUD factory — eliminates duplication across 5 nearly identical CRUD modules.
//
// The createCrudModule function accepts:
//   - tableName: string (for log/error messages)
//   - buildRecord: (id, input, extra?) => Record  (extra is for modules like
//     turns/templates that need a path separate from the input object)
//   - filterFn: (record, filter) => boolean        (additional filter beyond the
//     built-in `ids` filtering)
//
// Returns an object with append / get / query / update / list.

import { readJsonl, appendJsonl, updateJsonl } from "../utils/jsonl.ts";

export function createCrudModule<
  RecordType extends { id: string },
  Input,
  Filter,
>(
  /** Used for log/error messages (not currently emitted, reserved for future). */
  _tableName: string,
  buildRecord: (id: string, input: Input, extra?: unknown) => RecordType,
  filterFn: (record: RecordType, filter: Filter) => boolean,
) {
  return {
    /**
     * Append a new record built from `input` (and optional `extra`) to the JSONL file.
     */
    async append(
      tablePath: string,
      id: string,
      input: Input,
      extra?: unknown,
    ): Promise<RecordType> {
      const record = buildRecord(id, input, extra);
      await appendJsonl(tablePath, record);
      return record;
    },

    /**
     * Get a single record by ID. Returns null when not found.
     */
    async get(
      tablePath: string,
      id: string,
    ): Promise<RecordType | null> {
      const records = await readJsonl<RecordType>(tablePath);
      return records.find(r => r.id === id) ?? null;
    },

    /**
     * Query records. Built-in: filters by `filter.ids` if present (an array of
     * string IDs). The `filterFn` callback handles any additional conditions.
     */
    async query(
      tablePath: string,
      filter: Filter,
    ): Promise<RecordType[]> {
      let records = await readJsonl<RecordType>(tablePath);

      // Built-in: filter by ids if present
      if (filter && typeof filter === "object" && "ids" in filter) {
        const ids = (filter as Record<string, unknown>).ids;
        if (Array.isArray(ids) && ids.length > 0) {
          const idSet = new Set<string>(ids);
          records = records.filter(r => idSet.has(r.id));
        }
      }

      // Custom filter supplied by the module
      return records.filter(r => filterFn(r, filter));
    },

    /**
     * Update a record by ID with a partial patch. Returns true if found and
     * updated, false if the ID does not exist.
     */
    async update(
      tablePath: string,
      id: string,
      patch: Partial<RecordType>,
    ): Promise<boolean> {
      return updateJsonl<RecordType>(tablePath, id, patch);
    },

    /**
     * List all records. Equivalent to query(tablePath, {}), but avoids filter
     * overhead by reading the file directly.
     */
    async list(tablePath: string): Promise<RecordType[]> {
      return readJsonl<RecordType>(tablePath);
    },
  };
}
