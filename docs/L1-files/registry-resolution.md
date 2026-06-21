# `registry/resolution.ts` — Prompt Resolution Engine (Layer 2)

**File purpose:** Consumes a `ScheduleState` from Layer 3 and resolves it into an ordered, deduplicated list of `ResolvedEntry` objects ready for prompt injection. Implements a 5-stage pipeline: **Collect → Dedup → Filter → Sort → Load**.

**Line count:** 253 lines (with imports and blank lines)  
**Dependencies:** `node:fs/promises`, `registry/types.ts`, `registry/storage.ts`

---

## Exports

| # | Export | Kind | Lines | Description |
|---|--------|------|-------|-------------|
| 1 | `isActive` | function | 38–66 | Lifecycle filter. Returns `true` if an entry is currently active based on its `lifecycle.type` (`permanent`, `rounds`, `time-window`, `session`). For `rounds`-type entries, compares `runCtx.roundNumber` against `entryLifecycleRound + maxRounds`. Unknown types default to active. |
| 2 | `exceedsFrequency` | function | 82–94 | Frequency-cap filter. Returns `true` if the entry has exceeded **any** of its `maxTotal`, `maxPer100`, `maxPer50`, or `maxPer25` caps (queried via `RegistryStorage`). No cap configured → always returns `false`. |
| 3 | `expandTemplate` | function | 112–142 | Recursive template expansion. Resolves a `type: "template"` entry's `memberIds` into a flat array of non-template entry IDs. Handles nested templates with cycle detection (`visited` Set). Missing entries are silently skipped. |
| 4 | `resolveScheduled` | async function | 187–253 | **Main pipeline entry point.** Takes `ScheduleState`, `RegistryStorage`, `RunContext`, and optional `lifecycleMap`. Runs the full 5-stage pipeline: collects entries from tags/IDs/groups/templates; deduplicates by entry ID (via `Map`); filters by `isActive` + `exceedsFrequency`; sorts by `priority` descending; loads content (inline or file). Returns `Promise<ResolvedEntry[]>`. |

### Private internals (not exported)

| # | Name | Kind | Lines | Description |
|---|------|------|-------|-------------|
| — | `loadContent` | async function | 154–164 | Loads entry content: returns inline `content` field if present, reads `filePath` from disk otherwise, or returns empty string / error placeholder. |

---

## Pipeline summary

```
ScheduleState ──→ 1. COLLECT ──→ 2. DEDUP ──→ 3. FILTER ──→ 4. SORT ──→ 5. LOAD ──→ ResolvedEntry[]
                  (tags/ids/     (Map by id)  (isActive +    (priority     (file or
                   groups/                                descending)    inline)
                   templates)
```

All lifecycle and frequency filtering is delegated to the two helper functions (`isActive` / `exceedsFrequency`), keeping the pipeline readable and testable.
