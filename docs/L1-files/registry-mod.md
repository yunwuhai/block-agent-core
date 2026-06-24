> **REORGANIZED:** The registry subsystem has been restructured into a core/runtime split:
> - **Algorithm layer** moved to `core/` — core/registry.ts, core/pipeline.ts, core/composer.ts
> - **I/O layer** moved to `runtime/` — runtime/registry-store.ts, runtime/actions.ts
> See `docs/L1-files/core-*.md` and `docs/L1-files/runtime-*.md` for the current implementations.
> This file documents the LEGACY module and is retained for reference during migration.

# `registry/mod.ts` — Prompt Registry Barrel

**Purpose:** Barrel file that re-exports the public API of the prompt registry module, which follows a three-layer architecture for LLM-driven prompt injection: Storage → Resolution → Orchestration, plus a Composer layer for message building.

## Re-exports

| Symbol | Source | Lines | Description |
|---|---|---|---|
| `RegistryEntry`, `CallRecord`, `CallTrigger`, `ScheduleState`, `ResolvedEntry`, `RunContext`, `EntryType`, `LifecycleType`, `LifecycleConfig`, `FrequencyConfig`, `SlidingWindowState` | `./types.ts` | 12–24 | All core type definitions for the registry (entries, calls, schedules, lifecycle, frequency). |
| `RegistryStorage` | `./storage.ts` | 27 | Layer 1 — JSONL-backed entry store with in-memory indexes for CRUD and query. |
| `resolveScheduled` | `./resolution.ts` | 31 | Layer 2 — Deduplicate entries and filter active, due, non-exceeded items. |
| `isActive` | `./resolution.ts` | 32 | Check whether a lifecycle entry is still active (not expired/consumed). |
| `exceedsFrequency` | `./resolution.ts` | 33 | Check whether a call record exceeds the configured frequency cap. |
| `expandTemplate` | `./resolution.ts` | 34 | Expand `{{handlebars}}` templates with run-context data. |
| `ScheduleOrchestrator` | `./orchestration.ts` | 38 | Layer 3 — Mutable schedule state manager; exposes LLM-callable tool methods (add, remove, trigger, update, view). |
| `composeMessage` | `./composer.ts` | 41 | Build a final prompt message: Table of Contents + injected entries + run context. |
| `buildToCTable` | `./composer.ts` | 41 | Build the ASCII table-of-contents section for the composed message. |
