# L2 Module: Root Entry

**Purpose:** Extension entry point. Registers PI tools and bridges host tool calls into the internal execution pipeline.

## Member Files

| L1 Doc | Source File | Role |
|---|---|---|
| `index.md` | `index.ts` | Registers `efficiency_subagent`. |

## `efficiency_subagent` Flow

1. Reset prompt engine state.
2. Validate raw params with `ToolParamsSchema`.
3. Resolve `cwd` from host context.
4. Call `executeRun({ cwd, params, signal })`.
5. Render events via `renderSectioned()`.
6. Return structured details with run id, status, output, and events.

## Dependencies

| L1 Doc | Used For |
|---|---|
| `config-mod.md` | Tool param schema and type. |
| `runtime-mod.md` | `executeRun()`. |
| `runtime-prompt-slots-engine.md` | `reset()` before each invocation. |
| `display-mod.md` | Sectioned result rendering. |

Lifecycle scripts are not registered by the root entry.
