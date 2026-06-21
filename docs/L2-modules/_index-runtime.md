# L2 Module Index: `runtime/`

**Scope:** The `runtime/` source tree, decomposed into 3 modules by functional coupling.

**Decomposition rationale:** Three bounded contexts emerged from the dependency graph:
- `runtime-core` is the orchestrator that wires everything together (depends on the other two)
- `prompt-engine` is a standalone stateful service consumed by both core and hooks
- `hook-system` is a self-contained subsystem with its own types, execution, and output bridge (depends on prompt-engine)

---

## Module List

| Module | Doc | L1 Files | Type | Summary |
|--------|-----|----------|------|---------|
| `runtime-core` | [runtime-core.md](./runtime-core.md) | `runner.ts`, `mod.ts` | Orchestrator | Central execution lifecycle — profile loading, policy merge, prompt rendering, hook dispatch, tool simulation, handoff, persistence. Entry point: `executeRun()`. ⚠️ Boundary violation — see [L3/_bugs.md](../L3-architecture/_bugs.md#violation-1-runtime-core--the-cross-cutting-orchestrator). Split deferred. |
| `prompt-engine` | [prompt-engine.md](./prompt-engine.md) | `prompt-slots/engine.ts` | Engine | Stateful rendering service with module-level slots/stacks/placeholders. Three strategies: Registry composition, `{{name}}` placeholder replacement, priority-ordered slot prepend. Supports serialization for multi-turn continuation. |
| `hook-system` | [hook-system.md](./hook-system.md) | `hooks/types.ts`, `hooks/runner.ts`, `hooks/slot-insertion.ts`, `hooks/mod.ts` | Subsystem | User-defined hook scripts at four lifecycle phases. Safe script execution with timeout guards, path-traversal protection, and two output injection bridges (direct slot setter and registry-backed entry). |

> **Step 4a status: DEFERRED.** The `runtime-core` module was NOT split into `runtime-orchestrator` + `tool-simulator`. All 3 runtime modules remain in their original L2 decomposition. See [L3/_bugs.md](../L3-architecture/_bugs.md) for the deferred split plan.

---

## Dependency Graph

```
                   runtime-core
                   (runner.ts + mod.ts)
                   /              \
                  ▼                ▼
          prompt-engine        hook-system
          (engine.ts)          (types, runner, slot-insertion, mod)
                  ▲                │
                  └────────────────┘
              hook-system writes output
              into prompt-engine via
              setSlot / registry.register
```

**Arrows indicate "depends on / calls into":**
- `runtime-core` → `prompt-engine`: calls `setRegistry()`, `renderPromptWithRegistry()`, `serializeSlots()`, `deserializeSlots()`
- `runtime-core` → `hook-system`: calls `runHookScripts()` via `runPhaseHook()`, uses `registerHookOutput()` for slot injection
- `hook-system` → `prompt-engine`: `slot-insertion.ts` calls `setSlot()` directly, accesses registry via `getRegistry()`/`getOrchestrator()`

---

## External Dependencies (outside `runtime/`)

| External Layer | Consumed By | Purpose |
|----------------|-------------|---------|
| `registry/` | runtime-core, prompt-engine, hook-system | `RegistryStorage`, `ScheduleOrchestrator`, `composeMessage()` |
| `policy/` | runtime-core | `loadProjectPolicy()`, `mergePolicies()`, `evaluate()` |
| `storage/` | runtime-core | `createRunDir()`, session persistence, handoff, transcript |
| `config/` | runtime-core | `ToolParams`, `Profile`, profile loading |
| `display/` | runtime-core | TUI event formatting |
| `hooks/scripts/` | hook-system (runner.ts) | Dynamic-import of user-authored `.ts` hook scripts |
