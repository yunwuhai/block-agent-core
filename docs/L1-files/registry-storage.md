# `registry/storage.ts` — JSONL-backed entry store with in-memory indexes

**Purpose:** Core storage engine for the Prompt Registry. Persists entries to `registry.jsonl` (project-level, full rewrite) and call history to `registry-calls.jsonl` (per-run, append-only). Maintains four in-memory indexes for O(1) lookups, plus per-entry sliding-window frequency counters.

**In-memory indexes (rebuilt on `load()`):** `IdIndex` (`Map<id, RegistryEntry>`), `NameIndex` (`Map<name, id>`), `TagIndex` (`Map<tag, Set<id>>`), `GroupIndex` (`Map<group, Set<id>>`).

---

## Internal class

| Name | Lines | Description |
|---|---|---|
| `SlidingWindowCounter` | 46–88 | Per-entry frequency tracker. Three ring buffers (100/50/25) store call timestamps; `count(window)` returns entries in the last N calls (FIFO eviction). Private — only used inside `RegistryStorage`. Methods: `constructor(state?)`, `record(timestamp)`, `count(window)`, `total()`, `toState()`. |

## Exports

### `RegistryStorage` — exported class (lines 94–569)

#### Persistence

| Method | Lines | Description |
|---|---|---|
| `constructor(jsonlPath)` | 107–109 | Set the path to `registry.jsonl`. Does not load automatically. |
| `load()` | 119–134 | Read all lines from `registry.jsonl`, parse JSON, rebuild all in-memory indexes. No-op if file missing. Best-effort: skips malformed lines. |
| `save()` | 140–148 | Full rewrite of `registry.jsonl` — serialize every entry in `idIndex` as one JSON object per line. |

#### CRUD

| Method | Lines | Description |
|---|---|---|
| `register(raw)` | 161–195 | Create a new entry with auto-generated UUID + timestamps. Accepts optional `tags`, `priority`, `lifecycle`. Populates all indexes. Returns the new `id`. |
| `registerIfNew(raw)` | 209–248 | Register only if no equivalent entry exists (matched by type/description/content/filePath/createdBy/group). Hook entries (`createdBy === "hook"`) skip dedup. Returns existing or new `id`. |
| `unregister(id)` | 254–261 | Remove entry by ID from all indexes + frequency counters. Returns `true` if existed. |
| `get(id)` | 264–266 | O(1) lookup by ID. Returns `RegistryEntry \| undefined`. |
| `getByName(name)` | 269–273 | O(1) lookup by `{{name}}` placeholder. Returns `RegistryEntry \| undefined`. |
| `update(id, patch)` | 279–304 | Partial update of mutable fields (description, content, filePath, tags, group, priority, lifecycle, frequency, name, memberIds). Re-indexes if tags/group/name change. Returns `true` on success. |
| `get size()` | 410–412 | Total number of registered entries (delegates to `idIndex.size`). |

#### Tag management

| Method | Lines | Description |
|---|---|---|
| `addTag(id, tag)` | 311–318 | Append a tag to an entry. Idempotent — no-op if tag already present. |
| `removeTag(id, tag)` | 321–328 | Remove a tag from an entry. Idempotent — no-op if not present. |

#### Index queries

| Method | Lines | Description |
|---|---|---|
| `findByTags(tags, match)` | 339–375 | Lookup by tag set. `match: "any"` returns union (default), `match: "all"` returns intersection. |
| `findByGroup(group)` | 378–384 | Return all entries in a group. |
| `list(filter?)` | 392–407 | List all entries with optional filters: `type`, `group`, `tags` (any match). Returns full entry array. |

#### Call history & frequency

| Method | Lines | Description |
|---|---|---|
| `setCallsPath(path)` | 421–423 | Set path to `registry-calls.jsonl` for the current run. Must be called before `recordCall()`. |
| `recordCall(record)` | 429–443 | Append a `CallRecord` JSONL line to the calls file + update in-memory sliding window counter. Creates directory if needed. |
| `getCallHistory(entryId)` | 449–464 | Read `registry-calls.jsonl` and return all `CallRecord` lines matching `entryId`. |
| `getFrequency(entryId, window)` | 470–474 | Return sliding-window call count for a given entry and window size (25, 50, or 100). |
| `getTotalCalls(entryId)` | 477–481 | Return lifetime total call count for an entry. |
| `loadFreqState(state)` | 487–491 | Deserialize frequency counter state (for session resume). |
| `exportFreqState()` | 494–500 | Serialize all frequency counter states for persistence. |

#### Internal helpers (private)

| Method | Lines | Description |
|---|---|---|
| `indexEntry(entry)` | 507–535 | Add an entry to all four in-memory indexes. |
| `unindexEntry(entry)` | 538–560 | Remove an entry from all four in-memory indexes. |
| `clear()` | 563–569 | Wipe all indexes + frequency counters. |

---

**Interaction with:** `./types.ts` (defines `RegistryEntry`, `CallRecord`, `SlidingWindowState`, `EntryType`, `LifecycleConfig`, `FrequencyConfig`).
