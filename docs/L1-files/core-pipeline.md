# L1 -- `backend/core/pipeline.ts`

**Purpose:** The AssemblyPipeline — a pure function `resolve()` that transforms `ContextRequest + Registry + RunContext` into `ContextAssembly` through 6 deterministic steps. The heart of the assembly metaphor. No I/O, no side effects (single permitted impurity: `Date.now()` fallback for `time-window` lifecycle).

**Lines:** 751

## Exports

| Export | Kind | Lines | Description |
|---|---|---|---|
| `CycleError` | class | 65--70 | Thrown when dependency chain exceeds `MAX_DEPTH` (10). Extends `Error`. |
| `isActive` | function | 126--152 | Lifecycle check supporting `permanent`, `rounds`, `time-window`, `session`. `time-window` uses `Date.now()` when `context.currentTimestampMs` is omitted. |
| `checkFrequency` | function | 176--243 | Frequency-gate check. Returns `true` when entry exceeds caps (`maxTotal`, `maxPer100`, `maxPer50`, `maxPer25`). Sorts records by timestamp, counts within sliding window of distinct rounds. |
| `resolve` | function | 314--691 | Main pipeline entry point. 6 steps: Collect → Resolve Dependencies → Check Conflicts → Filter → Budget Allocate → Load Content → ContextAssembly. |

## Pipeline Steps

### Step 1 — COLLECT (lines 326--363)
Gathers candidate entries from `request.want`:
- `want.capabilities` → `registry.findByCapability()`
- `want.entryIds` → `registry.get()` per ID
- `want.tags` → `registry.findByTags(tags, "any")`

Deduplicates by entry ID. Missing entries/capabilities with no matches → silently skipped (future enhancement: `warnings` field on ContextAssembly).

### Step 2 — RESOLVE DEPENDENCIES (lines 365--440)
Recursively expands `entry.depends` for each candidate using `resolveDeps()` (lines 263--294):
- Depth-first traversal, `MAX_DEPTH = 10` limit
- Cycle detection via `visited` set — returns empty for safe cycles
- Missing dependencies → entry excluded with reason `"missing-dep"`
- Dependencies are added to candidates with reason `"dependency"`

### Step 3 — CHECK CONFLICTS (lines 442--493)
For every pair of candidates, checks `entry.conflicts`:
- Lower priority entry is excluded with reason `"conflict"`
- Equal priority: later-collected entry is excluded
- Non-symmetric check: A declares conflicts with B means B also checked against A

### Step 4 — FILTER (lines 497--530)
Two checks per candidate:
- **Lifecycle**: `isActive(entry, context)` — `permanent` always passes, `rounds` checks `currentRound`, `time-window` checks ISO interval, `session` always passes
- **Frequency**: `checkFrequency(entry, records)` — called when `request.enforceFrequency !== false` and `frequencyState` is provided

Failed entries excluded with reason `"lifecycle"` or `"frequency"`.

### Step 5 — BUDGET ALLOCATE (lines 533--640)
Separates pinned from unpinned candidates. Pinned entries mounted first (bypass budget, but individually overflow-checked). Unpinned sorted by priority descending, mounted greedily until `maxTokens` or `maxEntries` exhausted. Excluded entries get reason `"budget"` with detail showing remaining budget.

### Step 6 — LOAD CONTENT (lines 643--691)
Sets `needsRead` / `needsGenerate` flags on mounted entries based on `kind`. Builds final ContextAssembly: `mounted` + `excluded` + `pool` (all registry entries not in the other two) + `metrics`.

## Internal

| Symbol | Lines | Description |
|---|---|---|
| `InclusionReason` | 88 | `"request" \| "dependency"` — why an entry entered the pipeline |
| `CandidateEntry` | 90--93 | `{ entry, reason }` — tracks pipeline candidates |
| `PipelineState` | 99--105 | `{ candidates, excluded }` — mutable state across steps |
| `resolveDeps()` | 263--294 | Recursive dependency resolver with cycle + depth guards |
| `resolveMountReason()` | 701--733 | Maps `CandidateEntry` to `MountReason` for final output |
| `buildFrequencyDetail()` | 738--750 | Builds human-readable frequency exclusion detail string |

## Notes

- **Deterministic**: All steps are deterministic when `RunContext.currentTimestampMs` is provided. The `Date.now()` fallback in `isActive()` is the only permitted impurity.
- **Pure function**: No side effects, no I/O. All data flows through return values.
- **Pinned entries**: Bypass budget but still checked for lifecycle and frequency. Individual overflow (> maxTokens for single entry) still excludes them.
- **Pool construction**: Any registry entry not in `mounted` or `excluded` is included in `pool` for ToC display.
