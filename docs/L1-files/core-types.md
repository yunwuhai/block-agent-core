# L1 -- `backend/core/types.ts`

**Purpose:** Core type definitions for better-subagent. Single source of truth for the assembly pipeline — defines Entry, ContextRequest, ContextAssembly, Capability, FinalPrompt, and all supporting types. Pure structural types only; no I/O.

**Lines:** 559

## Exports

| Export | Kind | Lines | Description |
|---|---|---|---|
| `EntryKind` | type | 34 | `"inline" \| "file" \| "generator"` — discriminates how `content` is interpreted |
| `Lifecycle` | type | 44--48 | Discriminated union: `permanent`, `rounds` (maxRounds), `time-window` (start/end ISO), `session` |
| `FrequencyGate` | interface | 56--65 | Limits how often an entry can be injected: `maxTotal`, `maxPer100`, `maxPer50`, `maxPer25` |
| `Entry` | interface | 97--161 | The fundamental context unit: content-addressed `id`, `name`, `version`, `kind`, `content`, `mimeType`, `description`, `capabilities`, `depends`, `conflicts`, `estimatedTokens`, `priority` (0--100), `lifecycle`, `frequency`, `tags`, `group` |
| `EntryInput` | interface | 188--236 | Builder-pattern input for adding entries — `id`/`version` optional (auto-generated), all other non-identity fields optional with documented defaults |
| `Capability` | interface | 259--271 | Named capability: `name`, `description`, `implies` (capability DAG), `defaultEntryIds` |
| `ContextRequest` | interface | 284--311 | Assembly request: `want` (capabilities/entryIds/tags), `budget` (maxTokens/maxEntries), `enforceFrequency`, `pinnedEntryIds` |
| `ContextAssembly` | interface | 329--341 | Pipeline output: `mounted`, `excluded`, `pool`, `metrics` |
| `MountReason` | type | 348 | `"pinned" \| "capability" \| "dependency" \| "tag-match"` |
| `MountedEntry` | interface | 357--380 | Entry that passed the pipeline: `entry`, `reason`, `tokens`, `needsRead`, `needsGenerate` |
| `ExcludeReason` | type | 387--393 | `"budget" \| "frequency" \| "conflict" \| "lifecycle" \| "missing-dep" \| "not-found"` |
| `ExcludedEntry` | interface | 402--411 | Entry rejected by pipeline: `entry`, `reason`, `detail` |
| `PoolEntry` | interface | 424--427 | Available but not selected entry (metadata only, `content: ""`) |
| `AssemblyMetrics` | interface | 436--451 | Aggregate stats: `totalTokens`, `budgetUsedPercent`, `mountedCount`, `excludedCount`, `poolCount` |
| `FinalPrompt` | interface | 463--469 | Assembled prompt: `sections` (ordered PromptSection[]), `metrics` |
| `SectionRole` | type | 476 | `"toc" \| "injected" \| "context"` |
| `PromptSection` | interface | 487--493 | Single prompt section: `role`, `content` |
| `AddMode` | type | 507 | `"persistent" \| "transient"` — whether entry survives restart |
| `RunContext` | interface | 519--536 | Pipeline context: `currentRound`, `sessionId`, `runId`, `currentTimestampMs?` |
| `CallRecord` | interface | 549--558 | Frequency tracking record: `entryId`, `roundId`, `timestamp` |

## Notes

- `Entry.id` is content-addressed (SHA-256 hex truncated), enabling dedup at the storage layer.
- `Lifecycle` is a true discriminated union — `start`/`end` only exist for `time-window`, `maxRounds` only for `rounds`.
- `EntryInput` uses builder-pattern defaults: callers only supply what differs from defaults.
- `ContextRequest` separates selection (`want`) from constraints (`budget`, `pinnedEntryIds`).
- `ContextAssembly` returns the full disposition of every considered entry.
- All array fields are `readonly string[]` for immutability.
- The only non-determinism in the pipeline is `Date.now()` fallback for `time-window` lifecycle checks.
