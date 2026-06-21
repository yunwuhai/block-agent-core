# L2 Module Index: Runtime/Operation

**Scope:** Runtime execution modules after reorganization into `frontend/operation/` and `backend/computation/prompt/`.

## Module List

| Module | Doc | L1 Files | Type | Summary |
|---|---|---|---|---|
| `runtime-core` | [runtime-core.md](./runtime-core.md) | `runtime-orchestrator.md`, `runtime-tool-simulator.md`, `runtime-mod.md` | Orchestrator | Run lifecycle, action loop, policy enforcement, persistence, artifacts. |
| `prompt-engine` | [prompt-engine.md](./prompt-engine.md) | `runtime-prompt-slots-engine.md` | Engine | Registry rendering, placeholders, slots, continuation serialization. |

## Dependency Graph

```
runtime-core
  -> prompt-engine
  -> registry
  -> policy
  -> storage/output
  -> display
```

Lifecycle scripts are no longer part of the runtime module set.
