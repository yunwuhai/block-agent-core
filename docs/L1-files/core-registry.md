# L1 -- `backend/core/registry.ts`

**Purpose:** In-memory Entry Registry with multiple O(1) indexes. Pure data structure — no I/O, no side effects. Supports persistent/transient entry lifecycle, CRUD with content-addressed dedup, multi-index queries, round tracking, and serialization exports. Loaded from disk at startup by `runtime/registry-store.ts`.

**Lines:** 486

## Exports

| Export | Kind | Lines | Description |
|---|---|---|---|
| `generateEntryId` | function | 27--29 | Generates content-addressed ID from content string: SHA-256 truncated to 16 hex chars |

### `Registry` class

| Method | Lines | Description |
|---|---|---|
| `constructor()` | 94--96 | Initializes all indexes (empty). No arguments needed. |
| `add(input, mode)` | 116--150 | Add entry. Auto-generates ID from content hash if not provided. Idempotent on duplicate ID. `mode: "transient"` marks entry as ephemeral. Returns resolved ID. |
| `remove(id)` | 160--168 | Remove entry from all indexes + round counter + transient set. Returns `true` if found. |
| `update(id, changes)` | 181--193 | Update mutable fields. Rebuilds indexes for changed indexed fields. `id` is immutable. |
| `get(id)` | 201--203 | O(1) lookup by entry ID. Returns `Entry \| undefined`. |
| `getByName(name)` | 212--215 | O(1) lookup by `entry.name`. Returns `Entry \| undefined`. |
| `size` (getter) | 221--223 | Total entry count (persistent + transient). |
| `findByCapability(capability)` | 235--239 | Find all entries declaring a specific capability. Returns `Entry[]`. |
| `findByTags(tags, mode)` | 250--280 | Find by tags: `"any"` (union) or `"all"` (intersection). Returns `Entry[]`. |
| `findByGroup(group)` | 288--292 | Find all entries in a group. Returns `Entry[]`. |
| `list()` | 297--299 | List every entry. Returns `Entry[]`. |
| `listTransient()` | 304--306 | List all transient entries (in-memory only). Returns `Entry[]`. |
| `listPersistent()` | 313--317 | List all persistent entries (`list()` minus `listTransient()`). Returns `Entry[]`. |
| `advanceRound(id)` | 332--335 | Increment per-entry round counter. Used for `rounds`-type lifecycle expiration. |
| `getRoundCount(id)` | 343--345 | Get round count for an entry (0 if never advanced or unknown). |
| `exportPersistent()` | 356--360 | Export all persistent entries for serialization (JSONL). Returns `Entry[]`. |
| `exportTransient()` | 365--367 | Export all transient entries. Returns `Entry[]`. |
| `importPersistent(entries)` | 379--387 | Bulk-import persistent entries at startup. Idempotent — skips existing IDs. |

## Internal

| Symbol | Lines | Description |
|---|---|---|
| `idIndex` | 70 | `Map<string, Entry>` — primary index |
| `nameIndex` | 73 | `Map<string, string>` — name → id |
| `capabilityIndex` | 76 | `Map<string, Set<string>>` — capability → Set of entry IDs |
| `tagIndex` | 79 | `Map<string, Set<string>>` — tag → Set of entry IDs |
| `groupIndex` | 82 | `Map<string, Set<string>>` — group → Set of entry IDs |
| `transientIds` | 85 | `Set<string>` — IDs of ephemeral entries |
| `roundCounters` | 88 | `Map<string, number>` — per-entry round counters |
| `indexEntry(entry)` | 396--431 | Add entry to all indexes. Creates Set entries lazily. |
| `unindexEntry(entry)` | 439--466 | Remove entry from all indexes. Cleans up empty Set entries to prevent memory leaks. |
| `resolveIds(ids)` | 477--484 | Resolve collection of IDs to Entry objects. Filters out dangling references. |

## Notes

- **Content-addressed IDs**: `add()` calls `generateEntryId()` when no explicit ID provided — same content always produces same ID.
- **Idempotent**: `add()` and `importPersistent()` skip existing IDs without error.
- **Empty set cleanup**: `unindexEntry()` removes empty Set entries from secondary indexes to prevent stale key accumulation.
- **Serialize without I/O**: `exportPersistent()` / `importPersistent()` produce data only; actual I/O is handled by `runtime/registry-store.ts`.
