# L2 Module Index: Runtime/Operation

**Scope:** Runtime execution modules in `backend/runtime/` and `backend/computation/prompt/`.

## Module List

| Module | Doc | L1 Files | Type | Summary |
|---|---|---|---|---|
| `runtime-core` | [runtime-core.md](./runtime-core.md) | `runtime-orchestrator.md`, `runtime-mod.md` | Thin Orchestrator | Coordinates runtime I/O, lifecycle management, and core assembly pipeline. |
| `runtime-layer` | [runtime-layer.md](./runtime-layer.md) | `runtime-registry-store.md`, `runtime-run.md`, `runtime-actions.md`, `runtime-output.md` | I/O + Lifecycle | Persistence, lifecycle management, MountController API, output formatting. Wraps core assembly pipeline with I/O. |
| `prompt-engine` | [prompt-engine.md](./prompt-engine.md) | `runtime-prompt-slots-engine.md` | Engine (legacy) | Registry rendering, placeholders, slots, continuation serialization. |

## Dependency Graph

```
runtime-layer
  -> core/ (pipeline, composer, registry)
  -> storage/ (event-log, run-artifacts)
  -> input/ (profile-loader, project-loader, schema)
  -> policy/ (evaluator, merge)

runtime-core
  -> prompt-engine
  -> registry
  -> policy
  -> storage/output
```

Lifecycle scripts are no longer part of the runtime module set.
