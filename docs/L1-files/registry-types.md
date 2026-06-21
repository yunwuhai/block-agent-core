# L1 — `registry/types.ts`

**Purpose:** Core type definitions for the Prompt Registry system — entry model, lifecycle/frequency configuration, call-history tracking, schedule state, resolution output, and run context. These types are the shared contract across all three registry layers (Storage, Resolution, Orchestration).

---

## Exports

| Symbol | Kind | Lines | Description |
|---|---|---|---|
| `EntryType` | type | 17 | Discriminated union: `"custom"` \| `"hook-output"` \| `"file"` \| `"template"`. Tags the content source strategy for a registry entry. |
| `LifecycleType` | type | 27 | Union: `"permanent"` \| `"rounds"` \| `"time-window"` \| `"session"`. Determines when an entry is active for scheduling/injection. |
| `LifecycleConfig` | interface | 29–39 | Lifecycle settings — `type` discriminator, optional `maxRounds`/`validFrom`/`validUntil`, required `createdAt` (unix ms). |
| `FrequencyConfig` | interface | 48–57 | Injection-frequency caps — `maxTotal` (lifetime hard cap), `maxPer100`/`maxPer50`/`maxPer25` (sliding window limits). |
| `RegistryEntry` | interface | 67–108 | The core entry unit persisted in `registry.jsonl`. Contains `id`, `type`, `description`, optional `content`/`filePath`/`memberIds`/`name`/`tags`/`group`/`frequency`, required `priority`/`lifecycle`/`createdBy`/`createdAt`/`updatedAt`. |
| `CallTrigger` | type | 115 | Union: `"tag"` \| `"id"` \| `"group"` \| `"template"`. How an entry was triggered for injection. |
| `CallRecord` | interface | 121–126 | Per-injection record appended to `registry-calls.jsonl` — `entryId`, `roundId`, `timestamp`, `trigger`. |
| `ScheduleState` | interface | 136–145 | Mutable per-round schedule built by Layer 3 orchestration tools — `tags`, `ids`, `groups`, `templates` (all `ReadonlySet<string>`). |
| `ResolvedEntry` | interface | 155–158 | A fully resolved entry ready for injection — the loaded `content` string alongside its `RegistryEntry`. |
| `RunContext` | interface | 165–169 | Minimal runner context — `runId`, `roundNumber`, `cwd`. Passed into resolution and orchestration. |
| `SlidingWindowState` | interface | 176–185 | Raw frequency-counter state persisted alongside calls data — `window100`/`window50`/`window25` timestamp arrays + `totalCalls`. |

---

## Notes

- Every interface field is `readonly` — the types are designed for immutable data flow across registry layers.
- `RegistryEntry` uses **optional + mutually exclusive** fields (`content` vs `filePath`, `memberIds` for templates) gated by the `type` discriminator at runtime (not encoded in the type system).
- `LifecycleConfig.createdAt` is required by all lifecycle types because `"rounds"` and `"session"` both compute expiry from it.
- `FrequencyConfig` limits are checked against `SlidingWindowCounter` data in `registry-calls.jsonl` — exceeding any single limit excludes the entry from the current resolution pass.
- No non-exported items; every binding in the file is exported.
