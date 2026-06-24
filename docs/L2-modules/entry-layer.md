# L2 Module: Entry Layer

**Purpose:** Assembler layer — wires all dependencies together and exports the public API. Provides `executeRun()` for subagent invocation and re-exports all core modules for programmatic use.

## Member Files

| L1 Doc | Source File | Role |
|---|---|---|
| `entry-index.md` | `backend/entry/index.ts` | Public API: executeRun() + core re-exports |
| `tests-entry-test.md` | `backend/entry/entry.test.ts` | Integration tests |
| `index.md` | `index.ts` (legacy) | PI extension tool registration (backward compat) |

## Architecture

```
Entry Layer
  ├── executeRun()         ← Public API
  │   ├── createProjectPaths()
  │   ├── RegistryStore.load()
  │   ├── RegistryStore.loadCapabilities()
  │   ├── MountControllerAdapter   ← bridges actions.ts → run.ts interface
  │   ├── RunLifecycle              ← delegates create/continue
  │   └── return RunResult
  │
  └── Re-exports           ← Programmatic access
      ├── Registry          (from core/registry)
      ├── resolve           (from core/pipeline)
      ├── compose           (from core/composer)
      ├── CapabilityRegistry (from core/capability)
      └── type *            (from core/types)
```

## Dependencies

| Dependency | Used For |
|---|---|
| `core/` (all) | Re-exports + pass to runtime |
| `runtime/registry-store` | Persistence init |
| `runtime/run` | RunLifecycle creation |
| `runtime/actions` | MountController implementation |
| `node:path` | Path joins |

## Notes

- **Dependency injection site**: All modules are created and wired here; no global singletons.
- **Lazy controller**: MountControllerAdapter delays creating the ControllerImpl until first use, avoiding needing the real run ID at construction time.
- **Public API surface**: `executeRun()` is the only async export; all core re-exports are synchronous.
