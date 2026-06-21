# L2 Module — `registry-types`

**Purpose:** Shared type contract for the Prompt Registry system. Defines every data shape — entries, lifecycle, frequency, call records, schedule state, resolution output, and run context — consumed across all three registry layers, the composer, and external consumers.

---

## Member Files

| L1 Doc | 1-Line Contribution |
|--------|---------------------|
| `registry-types.md` | Core type definitions: `RegistryEntry` (the central unit), `CallRecord` (injection audit), `ScheduleState` (per-round schedule snapshot), `ResolvedEntry` (ready-to-inject), `RunContext` (runner metadata), plus lifecycle, frequency, and discriminator types. |

---

## Internal Relationships

Single-file module. No internal data flow — all bindings are exported and consumed by every other registry module.

---

## Dependencies (outside this module)

**Imports from:** None. This is the foundation layer — all other registry modules import from it.

**Imported by:**
- `registry-storage.md` — uses `RegistryEntry`, `CallRecord`, `SlidingWindowState`, `EntryType`, `LifecycleConfig`, `FrequencyConfig`
- `registry-resolution.md` — uses `RegistryEntry`, `ResolvedEntry`, `ScheduleState`, `RunContext`
- `registry-orchestration.md` — uses `RegistryEntry`, `ScheduleState`, `RunContext`, `ResolvedEntry`
- `registry-composer.md` — uses `RegistryEntry`, `ResolvedEntry`, `RunContext`

---

## Notes

- All interface fields are `readonly` — designed for immutable data flow through the registry pipeline.
- `RegistryEntry.type` discriminator gates mutually exclusive fields (`content` vs `filePath`, `memberIds` for templates) at runtime, not via TypeScript unions.
- `LifecycleConfig.createdAt` is required by all lifecycle variants (`"rounds"` and `"session"` both compute expiry from it).

## Physical Location

| Source File | Current Path | Notes |
|------------|-------------|-------|
| `registry/types.ts` | `registry/types.ts` | All type definitions — foundation of the registry system |

> **Step 4a status: DEFERRED.** File remains in the legacy `registry/` directory. Planned move to `backend/computation/` not executed.
