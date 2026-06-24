# L1 -- `backend/entry/index.ts`

**Purpose:** Programmatic entry point — assembles all modules, wires dependencies, and exports the public API. Provides `executeRun()` for subagent invocation and re-exports core modules (Registry, resolve, compose, CapabilityRegistry, types). Contains `MountControllerAdapter` that bridges the `actions.ts` MountController to the `run.ts` MountController interface.

**Lines:** 262

## Exports

| Export | Kind | Lines | Description |
|---|---|---|---|
| `Registry` | re-export | 30 | Re-exports from `../core/registry.ts` |
| `resolve` | re-export | 31 | Re-exports from `../core/pipeline.ts` |
| `compose` | re-export | 32 | Re-exports from `../core/composer.ts` |
| `CapabilityRegistry` | re-export | 33 | Re-exports from `../core/capability.ts` |
| `type *` | re-export | 34 | Re-exports all types from `../core/types.ts` |
| `executeRun` | async function | 197--261 | Main public API. Wires all dependencies, creates RunLifecycle, delegates create/continue. |

### `MountControllerAdapter` class (lines 75--166)

Adapter bridging `actions.ts` MountController (mount/unmount/view API) to `run.ts` MountController interface (scheduleTags/scheduleIds/scheduleGroup/unscheduleIds/unscheduleTags/clearSchedule API). Creates underlying controller lazily on first use.

| Method | Lines | Description |
|---|---|---|
| `constructor(registry, capabilities, pipelineFn, ctx)` | 82--87 | Stores dependencies. Context initialised as placeholder (real run ID set later). |
| `setRunContext(ctx)` | 97--101 | Updates run context, invalidates lazy controller. Used when run ID becomes known. |
| `ensure()` | 110--121 | Creates underlying ControllerImpl lazily on first access. |
| `scheduleTags(tags)` | 127--133 | Delegates to `impl.mount({ tags })`. Returns `{ scheduled, ids }`. |
| `scheduleIds(ids)` | 135--138 | Delegates to `impl.mount({ entryIds })`. Returns `{ scheduled }`. |
| `scheduleGroup(group)` | 140--148 | Finds entries by group, delegates to `impl.mount({ entryIds })`. |
| `unscheduleIds(ids)` | 150--153 | Delegates to `impl.unmount({ entryIds })`. Returns `{ removed }`. |
| `unscheduleTags(tags)` | 155--160 | Finds entries by tag, delegates to `impl.unmount({ entryIds })`. |
| `clearSchedule()` | 162--165 | Resets to empty request via `impl.setSchedule({ want: {} })`. |

## Internal

| Symbol | Lines | Description |
|---|---|---|
| `impl` | 77 | Lazily-created `ControllerImpl` — null until first `ensure()` call |
| `lastAssembly` | 80 | Cached assembly from last controller operation |
| `ctx` | 86 | Current `RunContext` (updated via `setRunContext`) |

## Wiring Flow

```
executeRun({profile, task, cwd, runId?, actions?, schedule?})
  ├─ createProjectPaths(cwd)           → paths
  ├─ new RegistryStore(paths.baseDir)  → store
  ├─ store.load()                      → { registry }
  ├─ store.loadCapabilities()          → { capabilities }
  ├─ new MountControllerAdapter(...)   → controller (lazy, placeholder ctx)
  ├─ new RunLifecycle(store, registry, controller)
  ├─ if runId → lifecycle.continue()
  └─ else     → lifecycle.create()
      └─ returns RunResult
```

## Notes

- **Lazy controller**: `MountControllerAdapter` delays creating the underlying `ControllerImpl` until the first `scheduleTags`/etc. call. This avoids needing the real run ID at construction time.
- **Continuation context**: For continue runs, `setRunContext()` is called with the known run ID before `lifecycle.continue()`.
- **Public API surface**: `executeRun()` is the only async function exported; all core exports are synchronous re-exports for programmatic use.
- **Backward compat**: The legacy `index.ts` at project root redirects to this entry point.
