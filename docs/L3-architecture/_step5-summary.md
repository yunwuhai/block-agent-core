# Step 5 Summary: Core/Runtime Split & Assembly Architecture

**Date:** 2026-06-23
**Status:** Design complete, core + runtime modules written, L1/L2/L3 docs updated, legacy migration pending

## What Changed

The project was redesigned around the **assembly metaphor** with strict separation of algorithm (`core/`) from platform (`runtime/`). This addressed the original architecture's conflation of registry logic with I/O, and the lack of a clear boundary between orchestration strategy and assembly infrastructure.

## Key Architectural Decisions

### 1. Core/Runtime Split
`core/` modules import only from each other and `node:crypto` (for content-addressed ID generation). No `fs`, no `path`, no I/O. `runtime/` owns all filesystem access and process lifecycle management.

### 2. 6-Step Assembly Pipeline
Replaced ad-hoc schedule/filter logic with a deterministic pipeline:
```
Collect → Resolve Dependencies → Check Conflicts → Filter → Budget Allocate → Load Content
```

### 3. Capability System with Implies DAG
Entries declare capabilities (e.g. "code-review", "project-awareness"). Capabilities form an implication hierarchy (write implies read). The pipeline resolves capability names to entries.

### 4. MountController
Mutable runtime state manager exposing `mount`/`unmount`/`view` operations to the LLM. Each mutation re-resolves the pipeline. Tracks transient entries for automatic lifecycle management.

### 5. Atomic Registry Writes
`registry.jsonl` and `capabilities.jsonl` use write-to-tmp-then-rename protocol, guaranteeing crash-safe persistence.

### 6. Enhanced Handoff
`handoff.md` now includes a full **Context Assembly Summary** section showing mounted, excluded, and pool entries — critical for the external orchestrator's "decide → execute → observe → re-decide" loop.

### 7. Unified Entry API
All entry additions go through `registry.add(entry, mode)` where mode is `"persistent"` or `"transient"`. No separate registration and injection paths.

## Current Source Layout

```
backend/
  core/           ← NEW: pure algorithm
    types.ts
    registry.ts
    pipeline.ts
    composer.ts
    capability.ts
  runtime/        ← NEW: I/O layer
    registry-store.ts
    run.ts
    actions.ts
    output.ts
  entry/          ← NEW: wiring + public API
    index.ts
    entry.test.ts
  storage/        ← existing, refreshed
  input/          ← existing, refreshed
  computation/
    policy/       ← existing, slimmed
    registry/     ← LEGACY: being migrated to core/ + runtime/
    prompt/       ← LEGACY: being migrated to core/composer
```

## Migration Status

| Component | Status |
|---|---|
| core/ modules | ✓ Designed and written |
| runtime/ modules | ✓ Designed and written |
| entry/ + tests | ✓ Designed and written |
| L1 docs (new modules) | ✓ Written |
| L2 docs (new modules) | ✓ Written |
| L3 docs (this file) | ✓ Written |
| Legacy code removal | Deferred |
| New module test suite | Deferred |
| External orchestrator project | Not started |
