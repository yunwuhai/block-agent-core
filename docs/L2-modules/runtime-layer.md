# L2 Module: Runtime I/O Layer

**Purpose:** Runtime layer providing persistence, lifecycle management, and dynamic context control. Wraps the core assembly pipeline with I/O operations (JSONL persistence with atomic writes, run directory management, event logging) and exposes the MountController API for LLM-driven context adjustment at runtime.

## Member Files

| L1 Doc | Source File | Role |
|---|---|---|
| `runtime-registry-store.md` | `backend/runtime/registry-store.ts` | JSONL persistence + atomic writes for registry, calls, capabilities |
| `runtime-run.md` | `backend/runtime/run.ts` | RunLifecycle — orchestrates create/continue + artifact generation |
| `runtime-actions.md` | `backend/runtime/actions.ts` | MountController — LLM-callable mount/unmount/view operations |
| `runtime-output.md` | `backend/runtime/output.ts` | handoff.md + transcript.md formatting |

## Architecture

```
Runtime Layer (I/O + lifecycle)
  ├── registry-store.ts  ← Persistence (load/save/atomic write)
  ├── run.ts             ← Lifecycle (create/continue/action loop/artifacts)
  ├── actions.ts         ← State management (mount/unmount/view)
  └── output.ts          ← Formatting (handoff/transcript builders)
```

## Flow

```
executeRun(params)
  │
  ├─ RegistryStore.load()
  │   ├─ Read registry.jsonl → importPersistent → Registry
  │   ├─ Read registry-calls.jsonl → rebuild round counters
  │   └─ Read capabilities.jsonl → declare → CapabilityRegistry
  │
  ├─ RunLifecycle.create(config)
  │   ├─ Generate run ID + create directory
  │   ├─ loadProfile(.profiles/<name>.md)
  │   ├─ loadMergedPolicy(project + profile)
  │   ├─ register profile entries → Registry
  │   ├─ MountController.mount(initial request) → ContextAssembly
  │   ├─ Composer.compose(assembly, basePrompt) → FinalPrompt
  │   ├─ executeActionLoop(actions)
  │   │   ├─ tool_call → evaluate policy → log event
  │   │   └─ schedule/unschedule → MountController → re-resolve → log
  │   ├─ buildHandoff() + buildTranscript()
  │   └─ RegistryStore.save(registry)
  │
  └─ return RunResult
```

## Dependencies

| Dependency | Used For |
|---|---|
| `core/` (all modules) | Pipeline, Composer, Registry types |
| `storage/` (event-log, run-artifacts) | Event logging, directory creation |
| `input/` (profile-loader, project-loader, schema) | Profile YAML loading, Zod validation |
| `policy/` (evaluator, merge, loader) | Permission checks |
| `node:fs`, `node:fs/promises`, `node:path` | File I/O |
| `node:crypto` | Run ID generation |

## Notes

- **Thin orchestrator**: RunLifecycle is a coordinator — all domain logic is in core/.
- **Atomic writes**: registry.jsonl and capabilities.jsonl use write-to-tmp-then-rename.
- **MountController**: LLM-facing API for dynamic context adjustment. Each mutation re-resolves the pipeline.
- **Transient cleanup**: MountController automatically removes transient entries on unmount.
