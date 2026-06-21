# L1 — `backend/computation/registry/storage.ts`

**Purpose:** JSONL-backed Prompt Registry storage. Persists entries to `registry.jsonl`, persists call history to per-run `registry-calls.jsonl`, maintains in-memory indexes by id/name/tag/group, and tracks per-entry frequency counters.

## Exports

### `RegistryStorage` class

| Method | Lines | Description |
|---|---|---|
| `constructor(jsonlPath)` | 112–114 | Stores path to `registry.jsonl`. |
| `load()` | 124–139 | Loads JSONL entries and rebuilds indexes. |
| `save()` | 145–153 | Rewrites all registry entries as JSONL. |
| `register(raw)` | 166–196 | Creates a new entry with UUID/timestamps/defaults and indexes it. Input omits generated/defaulted fields. |
| `registerIfNew(raw)` | 207–240 | Deduplicates equivalent entries by type/description/content/filePath/createdBy/group, otherwise registers. Input omits generated/defaulted fields. |
| `unregister(id)` | 246–253 | Removes entry and frequency counters. |
| `get(id)` | 256–258 | Looks up by id. |
| `getByName(name)` | 261–265 | Looks up placeholder-bound entry by name. |
| `update(id, patch)` | 271–296 | Updates mutable fields and reindexes when needed. |
| `addTag(id, tag)` | 303–310 | Adds a tag idempotently. |
| `removeTag(id, tag)` | 313–320 | Removes a tag idempotently. |
| `findByTags(tags, match)` | 331–367 | Finds entries matching any/all tags. |
| `findByGroup(group)` | 370–376 | Finds entries in a group. |
| `list(filter?)` | 384–399 | Lists entries with optional type/group/tag filters. |
| `size` | 402–404 | Number of registered entries. |
| `setCallsPath(path)` | 413–415 | Sets call-history JSONL path for current run. |
| `recordCall(record)` | 421–435 | Appends a call record and updates frequency counters. |
| `getCallHistory(entryId)` | 441–456 | Reads persisted call history for one entry. |
| `getFrequency(entryId, window)` | 462–466 | Returns sliding-window count. |
| `getTotalCalls(entryId)` | 469–473 | Returns lifetime call count. |
| `loadFreqState(state)` | 479–483 | Restores frequency counter state. |
| `exportFreqState()` | 486–492 | Exports frequency counter state. |

## Internal

| Symbol | Lines | Description |
|---|---|---|
| `RegistryEntryInput` | 31–35 | Internal input type for registration; omits generated/defaulted registry fields. |
| `SlidingWindowCounter` | 51–93 | Per-entry frequency tracker. |
| `indexEntry(entry)` | 499–527 | Adds entry to all indexes. |
| `unindexEntry(entry)` | 530–552 | Removes entry from all indexes. |
| `clear()` | 555–561 | Clears indexes and counters. |
