# L2 Module: Root Entry

**Purpose:** Extension entry point. Registers PI tools and bridges host tool calls into the internal execution pipeline.

## Member Files

| L1 Doc | Source File | Role |
|---|---|---|
| `index.md` | `index.ts` | Registers `efficiency_subagent`. |

## `efficiency_subagent` Flow

1. Reset prompt state.
2. Validate raw params with `ToolParamsSchema`.
3. Resolve `cwd` from host context.
4. Call `executeRun({ profile, task, cwd, runId?, actions? })` via `backend/entry/index.ts`.
5. Return a compact text summary.
6. Return structured details with run id, status, output, handoff path, and optional transcript path.

## Dependencies

| L1 Doc | Used For |
|---|---|
| `config-schema.md` | Tool param schema and type. |
| `runtime-prompt-state.md` | `reset()` before each invocation. |

Lifecycle scripts are not registered by the root entry.
