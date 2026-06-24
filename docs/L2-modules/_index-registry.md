# L2 Registry Modules — Index

> **REORGANIZED (2026-06-23):** The registry subsystem has been split:
> - **Algorithm** → `core/` (core/registry.ts, core/pipeline.ts, core/composer.ts)
> - **I/O** → `runtime/` (runtime/registry-store.ts, runtime/actions.ts)
> See `core-layer.md` and `runtime-layer.md` for current architecture.
> The files documented below are LEGACY and retained for reference during migration.

The Prompt Registry is decomposed into **4 L2 modules**, organized by the 3-layer architecture (Storage → Resolution → Orchestration) plus a Composer consumer layer and a shared Types foundation. The barrel file `registry-mod.md` re-exports the full public API across all modules.

## Module Map

```
registry-mod.md (barrel — re-exports public API from all 5 source files)
    │
    ├── registry-types        ← foundation (imported by every module)
    │
    ├── registry-storage      ← Layer 1: persistence & indexing
    │       │
    │       ├──→ registry-engine  ← Layer 2+3: resolution pipeline + schedule orchestration
    │       │       │
    │       │       └──→ registry-composer  ← message assembly consumer
    │       │
    │       └──→ registry-composer (also calls storage directly)
    │
    └── registry-composer     ← depends on all three layers
```

## Modules

| # | Module | L1 Files | Layer | Summary |
|---|--------|----------|-------|---------|
| 1 | [`registry-types`](registry-types.md) | `registry-types.md` | Foundation | Shared type contract — `RegistryEntry`, `CallRecord`, `ScheduleState`, `ResolvedEntry`, lifecycle/frequency configs. Every other module imports from it. |
| 2 | [`registry-storage`](registry-storage.md) | `registry-storage.md` | Layer 1 | JSONL-backed persistence with four in-memory O(1) indexes and sliding-window frequency counters. Entry CRUD, call-history recording, frequency state serialization. |
| 3 | [`registry-engine`](registry-engine.md) | `registry-resolution.md`, `registry-orchestration.md` | Layer 2+3 | Runtime engine combining schedule orchestration (stateful, LLM-toolable) and resolution pipeline (stateless, 5-stage: Collect→Dedup→Filter→Sort→Load). Tightly coupled via `resolveForMessage()` → `resolveScheduled()`. |
| 4 | [`registry-composer`](registry-composer.md) | `registry-composer.md` | Composer | Top-level consumer: assembles the final LLM prompt from ToC, injected entries, and placeholder-resolved base prompt. Records call history as a side effect. |

## Dependency Chain (types → storage → resolution → orchestration → composer)

```
registry-types ──(imported by)──→ registry-storage
                                       │
                     ┌─────────────────┤
                     ▼                 ▼
              registry-resolution  registry-orchestration
              (Layer 2)            (Layer 3)
                     ▲                 │
                     │    resolveScheduled()
                     └─────────────────┘
                              │
                     registry-engine (L2 module)
                              │
                              ▼
                     registry-composer
```

**Key:** `registry-storage` exports `RegistryStorage` (Layer 1). `registry-resolution` calls storage for frequency checks; `registry-orchestration` calls storage for tag/group queries and calls resolution for `resolveScheduled()`. `registry-composer` calls all three layers to build the final prompt message.

## Public API Surface

The barrel file `registry-mod.md` re-exports from all 5 source files:
- **Types** (8 symbols): `RegistryEntry`, `CallRecord`, `CallTrigger`, `ScheduleState`, `ResolvedEntry`, `RunContext`, `EntryType`, `LifecycleType`, `LifecycleConfig`, `FrequencyConfig`, `SlidingWindowState`
- **Storage** (1 symbol): `RegistryStorage`
- **Resolution** (4 symbols): `resolveScheduled`, `isActive`, `exceedsFrequency`, `expandTemplate`
- **Orchestration** (1 symbol): `ScheduleOrchestrator`
- **Composer** (2 symbols): `composeMessage`, `buildToCTable`
