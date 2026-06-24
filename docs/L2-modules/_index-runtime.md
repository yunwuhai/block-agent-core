# L2 Module Index: Runtime/Operation

**Scope:** Runtime execution modules in `backend/runtime/`.

## Module List

| Module | Doc | L1 Files | Type | Summary |
|---|---|---|---|---|---|
| `runtime-layer` | [runtime-layer.md](./runtime-layer.md) | `runtime-registry-store.md`, `runtime-run.md`, `runtime-actions.md`, `runtime-output.md`, `runtime-prompt-state.md` | I/O + Lifecycle | Persistence, lifecycle management, MountController API, output formatting, prompt state. Wraps core assembly pipeline with I/O. |

## Dependency Graph

```
runtime-layer
  -> core/ (pipeline, composer, registry)
  -> storage/ (event-log, run-artifacts)
  -> input/ (profile-loader, schema)
  -> policy/ (evaluator, loader)
```

Lifecycle scripts are no longer part of the runtime module set.
