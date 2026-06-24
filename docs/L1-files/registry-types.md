> **REORGANIZED:** The registry subsystem has been restructured into a core/runtime split:
> - **Algorithm layer** moved to `core/` — core/registry.ts, core/pipeline.ts, core/composer.ts
> - **I/O layer** moved to `runtime/` — runtime/registry-store.ts, runtime/actions.ts
> See `docs/L1-files/core-*.md` and `docs/L1-files/runtime-*.md` for the current implementations.
> This file documents the LEGACY module and is retained for reference during migration.

# L1 — `backend/computation/registry/types.ts`

**Purpose:** Shared type contract for the Prompt Registry: entry model, lifecycle/frequency configuration, call-history tracking, schedule state, resolution output, run context, and sliding-window frequency state.

## Exports

| Symbol | Kind | Lines | Description |
|---|---|---|---|
| `EntryType` | type | 17 | `"custom" | "file" | "template"`. |
| `LifecycleType` | type | 27 | `"permanent" | "rounds" | "time-window" | "session"`. |
| `LifecycleConfig` | interface | 29–39 | Lifecycle settings with discriminator, optional bounds, and required `createdAt`. |
| `FrequencyConfig` | interface | 48–57 | Injection frequency caps. |
| `RegistryEntry` | interface | 66–107 | Core persisted registry entry. `createdBy` is `"user" | "system"`. |
| `CallTrigger` | type | 114 | `"tag" | "id" | "group" | "template"`. |
| `CallRecord` | interface | 120–125 | Per-injection call record. |
| `ScheduleState` | interface | 135–144 | Mutable schedule sets for tags, ids, groups, templates. |
| `ResolvedEntry` | interface | 154–157 | Loaded registry entry content ready for prompt injection. |
| `RunContext` | interface | 164–168 | Minimal run context for lifecycle/call tracking. |
| `SlidingWindowState` | interface | 175–184 | Raw frequency-counter persistence state. |

## Notes

- `custom` entries may carry inline `content` or use `filePath`.
- `file` entries are used for named placeholder resolution.
- `template` entries expand `memberIds` at schedule time.
