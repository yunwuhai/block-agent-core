# L2 Module: Runtime Core

**Purpose:** Operation-layer execution lifecycle for subagent runs. Ties together profile loading, policy enforcement, prompt rendering, tool simulation, durable event/session persistence, transcript generation, and structured handoff output.

## Member Files

| L1 Doc | Source File | Role |
|---|---|---|
| `runtime-orchestrator.md` | `frontend/operation/orchestrator.ts` | Run lifecycle orchestrator: run identity, run dir, profile/policy load, registry wiring, prompt render, action loop, artifacts, persistence. |
| `runtime-tool-simulator.md` | `frontend/operation/tool-simulator.ts` | Per-action tool simulation: policy evaluation, tool call/result logging, retry, slot mutation logging. |
| `runtime-mod.md` | `frontend/operation/mod.ts` | Barrel re-exporting orchestrator and tool simulator API. |

## Flow

```
index.ts
  -> executeRun()
    -> load profile + project policy
    -> setRegistry() + register profile prompt entries
    -> renderPromptWithRegistry()
    -> execute action loop
      -> executeWithRetry()
        -> simulateToolInteraction()
          -> evaluate(policy)
          -> append tool/event JSONL
    -> generateRunArtifacts()
    -> persist slots + registry
```

## Public API

- `executeRun(ctx): Promise<RunResult>`
- `executeWithRetry(...)`
- `simulateToolInteraction(...)`
- Types: `RunContext`, `RunResult`, `ToolInteractionResult`

## Notes

- Lifecycle script dispatch was removed from this module. Action execution is now controlled by explicit `actions` params and policy evaluation.
- Prompt/context loading is handled by registry and placeholder frontmatter, not lifecycle scripts.
- Frontend display events were removed; runtime status is represented by durable JSONL events plus generated transcript/handoff artifacts.
