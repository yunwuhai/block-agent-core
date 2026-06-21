# L2 Module — `registry-storage`

**Purpose:** Layer 1 of the Prompt Registry — persistent storage and in-memory indexing. Owns the `registry.jsonl` (project-level, full-rewrite) and `registry-calls.jsonl` (per-run, append-only) files, maintains four O(1) lookup indexes, and tracks per-entry sliding-window frequency counters.

---

## Member Files

| L1 Doc | 1-Line Contribution |
|--------|---------------------|
| `registry-storage.md` | `RegistryStorage` class: JSONL-backed CRUD, tag/group/name indexing, call-history recording, sliding-window frequency tracking, and serialization/deserialization of frequency state for session resume. |

---

## Internal Relationships

Single-file module. The internal `SlidingWindowCounter` class (private) drives the public `getFrequency()` / `getTotalCalls()` / `recordCall()` methods. All four in-memory indexes (`IdIndex`, `NameIndex`, `TagIndex`, `GroupIndex`) are rebuilt on `load()` and updated transactionally on `register()` / `update()` / `unregister()`.

---

## Dependencies (outside this module)

**Imports from:**
- `registry-types.md` — `RegistryEntry`, `CallRecord`, `SlidingWindowState`, `EntryType`, `LifecycleConfig`, `FrequencyConfig`

**Imported by:**
- `registry-resolution.md` — calls `getFrequency()`, `getTotalCalls()` for `exceedsFrequency()` checks; loads entries via `get()`, `findByTags()`, `findByGroup()`
- `registry-orchestration.md` — calls `findByTags()`, `findByGroup()`, `get()` for schedule operations
- `registry-composer.md` — calls `recordCall()` to log injections, `getByName()` for placeholder resolution

---

## Data Flow

```
registry.jsonl ──load()──→ [IdIndex, NameIndex, TagIndex, GroupIndex] ──→ CRUD + queries
registry-calls.jsonl ──recordCall()──→ [SlidingWindowCounter per entry] ──→ getFrequency()
```

All writes to `registry.jsonl` go through `save()` (full rewrite). All writes to `registry-calls.jsonl` are append-only via `recordCall()`. Frequency state can be exported/imported via `exportFreqState()` / `loadFreqState()` for cross-session continuity.

## Physical Location

| Source File | Current Path | Notes |
|------------|-------------|-------|
| `registry/storage.ts` | `registry/storage.ts` | `RegistryStorage` class — JSONL-backed CRUD, 4 O(1) indexes, frequency tracking |

> **Step 4a status: DEFERRED.** File remains in the legacy `registry/` directory. Planned move to `backend/storage/` not executed.
