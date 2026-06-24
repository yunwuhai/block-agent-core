# L2 Module: Runtime Core

**Purpose:** Backend cross-layer execution lifecycle for subagent runs. Ties together profile loading, dynamic context scheduling (scheduleEntries/unscheduleEntries), policy enforcement, prompt rendering, tool simulation, durable event/session persistence, transcript generation, and structured handoff output.

## Member Files

| L1 Doc | Source File | Role |
|---|---|---|
| `runtime-orchestrator.md` | `backend/runtime/orchestrator.ts` | Run lifecycle orchestrator: run identity, run dir, profile/policy load, registry wiring, schedule/unschedule processing, prompt render, action loop (including tool simulation + retry), frequency persistence, artifacts. |
| `runtime-mod.md` | `backend/runtime/mod.ts` | Barrel re-exporting `executeRun`. |

## Flow

```
index.ts
  -> executeRun()
    -> load profile + project policy
    -> setRegistry() + register profile prompt entries
    -> process scheduleEntries / unscheduleEntries actions
         (before prompt: mutate orchestrator schedule state)
    -> renderPromptWithRegistry()
         -> ToC table + injected (scheduled) entries + placeholder resolution
    -> execute action loop (schedule/unschedule actions filtered out)
      -> executeWithRetry()
        -> simulateToolInteraction()
          -> evaluate(policy)
          -> append tool/event JSONL
    -> generateRunArtifacts()
    -> persist slots + registry
```

## Public API

- `executeRun(ctx): Promise<RunResult>`

## Dynamic Context Scheduling

Action types `scheduleEntries` and `unscheduleEntries` enable per-run context variation:

- **`scheduleEntries`**: `{ toolName: "scheduleEntries", scheduleTags: ["coding"], scheduleIds: [...], scheduleGroup: "..." }` — injects specific registry entries into this run's prompt.
- **`unscheduleEntries`**: `{ toolName: "unscheduleEntries", unscheduleTags: ["api"], unscheduleIds: [...] }` — removes entries from the schedule (useful when combined with broad-tag scheduling).

These actions are processed **before prompt rendering** and filtered out of the tool action list. Each logs a durable `schedule_entries` / `unschedule_entries` event. Frequency limits are enforced across runs via shared `registry-calls.jsonl`.

## Notes

- Tool simulation and retry logic (`simulateToolInteraction`, `executeWithRetry`) lives inline in `backend/runtime/orchestrator.ts` as internal functions — no separate file.
- Lifecycle script dispatch was removed. Action execution is controlled by explicit `actions` params and policy evaluation.
- Prompt/context loading is handled by registry scheduling and placeholder frontmatter.
- Frequency counters persist in a shared `registry-calls.jsonl` (loaded by `RegistryStorage.load()`).
