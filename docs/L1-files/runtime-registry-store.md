# L1 -- `backend/runtime/registry-store.ts`

**Purpose:** RegistryStore — JSONL persistence layer for the in-memory Registry. Manages three files (registry.jsonl, registry-calls.jsonl, capabilities.jsonl) with atomic full-rewrite for entry/capability data and append-only logging for call history. Rebuilds Registry + round counters from disk on load.

**Lines:** 401

## Exports

| Export | Kind | Lines | Description |
|---|---|---|---|
| `CallRecord` | interface | 59--66 | Store-level call record: `entryId`, `timestamp` (ISO 8601), `round` (auto-incremented counter) |
| `LoadResult` | interface | 71--77 | Load result: `registry` (Registry) + `errors` (string[]) |
| `CapabilityLoadResult` | interface | 81--86 | Capability load result: `capabilities` (CapabilityRegistry) + `errors` |
| `ProjectPaths` | interface | 91--102 | Derived filesystem paths: `baseDir`, `registryPath`, `callsPath`, `capabilitiesPath`, `runsDir` |
| `createProjectPaths` | function | 124--133 | Derives standard storage paths from `cwd`. Convention: `.subagent/registry.jsonl`, `.subagent/registry-calls.jsonl`, `.subagent/capabilities.jsonl`, `.subagent/runs/`. |

### `RegistryStore` class

| Method | Lines | Description |
|---|---|---|
| `constructor(basePath)` | 179--183 | Stores paths to registry.jsonl, registry-calls.jsonl, capabilities.jsonl. Initializes round counters Map. |
| `load()` | 204--248 | Loads registry from disk: reads registry.jsonl → bulk-imports entries; reads registry-calls.jsonl → rebuilds round counters. Malformed lines skipped and recorded in errors. Missing files treated as empty. |
| `save(registry)` | 265--275 | Atomic save of persistent entries: serialize → write `.tmp` → `renameSync`. Transient entries excluded. Parent directory auto-created. |
| `appendCallLog(entryId, timestamp)` | 294--303 | Append one call record. Round auto-incremented per entryId. Parent directory auto-created. |
| `loadFrequencyState()` | 313--336 | Reads all lines from registry-calls.jsonl, groups by entryId. Returns `Map<string, CallRecord[]>`. Malformed lines skipped. |
| `saveCapabilities(registry)` | 354--364 | Atomic save of capabilities to capabilities.jsonl. Same write-to-tmp-then-rename protocol. |
| `loadCapabilities()` | 376--399 | Reads capabilities.jsonl, parses each line as Capability, declares on fresh CapabilityRegistry. Returns `CapabilityLoadResult` with parse errors. |

## Internal

| Symbol | Lines | Description |
|---|---|---|
| `registryPath` | 165 | Path to registry.jsonl |
| `callsPath` | 166 | Path to registry-calls.jsonl |
| `capabilitiesPath` | 167 | Path to capabilities.jsonl |
| `roundCounters` | 173 | `Map<string, number>` — per-entry auto-incrementing round counters |

## File Formats

```
registry.jsonl:       {"id":"...","name":"...","version":1,"kind":"inline","content":"...",...}
registry-calls.jsonl: {"entryId":"...","timestamp":"2026-06-23T10:00:00Z","round":3}
capabilities.jsonl:   {"name":"filesystem-read","description":"...","implies":["..."],"defaultEntryIds":["..."]}
```

## Atomic Write Protocol

1. Serialize persistent entries to JSONL string
2. Write to `<file>.tmp`
3. `renameSync(.tmp → .jsonl)` — atomic on same filesystem

Guarantees: the file on disk is either the complete old content or the complete new content. Never a partial write.

## Notes

- Transient entries are excluded from `save()` — only `registry.exportPersistent()` entries hit disk.
- `load()` is idempotent — `Registry.importPersistent()` skips existing IDs.
- Round counters are maintained in-memory; restored from call history on `load()`.
- `appendCallLog()` auto-creates parent directory via `mkdir({ recursive: true })`.
