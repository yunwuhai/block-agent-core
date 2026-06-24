# L3 Architecture: better-subagent

## Purpose

better-subagent is a **prompt assembly system** — a "Prompt File System" (PromptFS) that provides infrastructure for dynamically composing subagent context at runtime. The core innovation is **programmable context**: instead of pre-designed subagent templates, capabilities are assembled at runtime from a registry of reusable Entry objects by a deterministic Assembly Pipeline.

## Design Philosophy

- **Core (pure algorithm) vs Runtime (I/O)**: Strict architectural invariant — `core/` has zero filesystem imports. All I/O is in `runtime/` and `storage/`.
- **Assembly metaphor**: Context is *assembled*, not generated. Pipeline resolves which entries to include; Composer renders the final prompt format.
- **Infrastructure, not strategy**: better-subagent provides assembly primitives. An **external orchestrator** owns the strategy of WHAT to assemble, WHEN to adjust, and HOW to chain runs.
- **Entry is the unit**: Each Entry is a content-addressed, capability-declaring, dependency-aware context fragment. Entries compose like build-system modules.

## Layer Diagram

```
ENTRY (backend/entry/)
  │  Wires all dependencies, exports executeRun() + core re-exports
  │
  └── RUNTIME (backend/runtime/) — I/O + lifecycle
        ├── CORE (backend/core/) — pure algorithm, zero I/O
        │     ├── types.ts          — 19 type exports (Entry, ContextRequest, ...)
        │     ├── registry.ts       — in-memory data store + 5 indexes
        │     ├── pipeline.ts        — 6-step assembly pipeline (resolve)
        │     ├── composer.ts        — 3-section prompt composer (compose)
        │     └── capability.ts      — capability DAG with implies expansion
        │
        ├── registry-store.ts — JSONL persistence + atomic writes
        ├── run.ts           — run lifecycle (create/continue/action loop)
        ├── actions.ts       — MountController (mount/unmount/view)
        └── output.ts        — handoff + transcript formatting
  │
  ├── STORAGE (backend/storage/) — event log + run directories
  ├── INPUT (backend/input/) — profile/config loading + Zod schemas
  └── POLICY (backend/computation/policy/) — minimal permission evaluation
```

## Primary Execution Flow

```
User calls efficiency_subagent tool { profile, task, actions?, schedule? }
  │
  ├─ index.ts (PI extension registration)
  │   └─ validate params → executeRun()
  │
  ├─ entry/index.ts (wiring)
  │   ├─ RegistryStore.load()           → Registry (in-memory)
  │   ├─ RegistryStore.loadCapabilities() → CapabilityRegistry
  │   ├─ new MountControllerAdapter()   → lazy bridge
  │   └─ new RunLifecycle(...)
  │
  ├─ RunLifecycle.create(config)
  │   ├─ generateRunId()                → "profile-task-ISO-hash"
  │   ├─ createRunDir()                 → .subagent/runs/{id}/
  │   ├─ loadProfile()                  → YAML frontmatter + prompt
  │   ├─ loadMergedPolicy()             → project + profile Policy
  │   ├─ registerProfileEntries()       → Registry.add(entry, "persistent")
  │   ├─ MountController.mount(request) → ContextAssembly
  │   │   └─ Pipeline.resolve()
  │   │       ├─ COLLECT               (capabilities/IDs/tags → candidates)
  │   │       ├─ RESOLVE_DEPS          (recursive depends)
  │   │       ├─ CHECK_CONFLICTS       (pairwise, priority-based)
  │   │       ├─ FILTER                 (lifecycle + frequency gates)
  │   │       ├─ BUDGET_ALLOCATE        (priority-sorted, pinned bypass)
  │   │       └─ LOAD_CONTENT           (set needsRead/needsGenerate)
  │   │
  │   ├─ Composer.compose(assembly, prompt) → FinalPrompt
  │   │   ├─ ToC section               (pool entries as markdown table)
  │   │   ├─ Injected section          (mounted entries with content)
  │   │   └─ Context section           ({{name}} placeholders resolved)
  │   │
  │   ├─ executeActionLoop(actions)
  │   │   ├─ tool_call → policy check → event log
  │   │   └─ schedule/unschedule → MountController → re-resolve
  │   │
  │   ├─ buildHandoff() + buildTranscript()
  │   └─ RegistryStore.save()          (atomic write)
  │
  └─ return RunResult { id, status, handoffPath, transcriptPath, assembly? }
```

## Context Assembly Flow

```
ContextRequest                    6-Step Pipeline                  ContextAssembly
  want: {                             │                              ├─ mounted[]
    capabilities, entryIds,           ├─ COLLECT                     ├─ excluded[]
    tags                              ├─ RESOLVE_DEPS                ├─ pool[]
  }                                   ├─ CHECK_CONFLICTS             └─ metrics
  budget: {                           ├─ FILTER
    maxTokens, maxEntries             ├─ BUDGET_ALLOCATE                   │
  }                                   └─ LOAD_CONTENT                     ▼
  pinnedEntryIds                                                      Composer.compose()
  enforceFrequency                                                          │
                                                                           ▼
                                                                   FinalPrompt
                                                                     ├─ toc       (discoverable)
                                                                     ├─ injected  (mounted content)
                                                                     └─ context   (placeholder-resolved)
```

## Module Count

| Layer | Module Count | Key Files |
|---|---|---|
| Core Assembly | 5 | types, registry, pipeline, composer, capability |
| Runtime I/O | 4 | registry-store, run, actions, output |
| Storage | 2 | event-log, run-artifacts |
| Input | 4 | schema, params, profile-loader, project-loader |
| Policy | 3 | evaluator, merge, loader |
| Entry | 1 | index.ts |
| Legacy (migrating) | ~6 | registry/*, prompt/engine |

## Boundaries

- **core/ ←→ runtime/**: core exports pure functions + data structures; runtime imports them and adds I/O.
- **runtime/ ←→ storage/**: runtime delegates event logging and directory creation.
- **runtime/ ←→ input/**: runtime delegates profile and config loading.
- **runtime/ ←→ policy/**: runtime delegates permission checks.
- **External orchestrator**: consumes ContextAssembly + RunResult; submits ContextRequest. NOT part of this project.

## Removed from Architecture

- **Frontend/display layer** (frontend/operation/) — removed in step 4 refactoring.
- **Lifecycle scripts** — removed; replaced by explicit actions + policy + registry scheduling.
- **Standalone tool-simulator** — merged into orchestrator, then split into core/pipeline + runtime/actions.
