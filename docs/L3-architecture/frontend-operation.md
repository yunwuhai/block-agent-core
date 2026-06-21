# L3 Architecture: Frontend — 操作 (Operation)

The operation layer is the execution control surface. It receives tool invocations, validates parameters, coordinates profile/policy/prompt setup, dispatches explicit actions, and asks backend output modules to generate handoff/transcript artifacts.

## Member Modules

| # | Module | Primary | Secondary | Description | L2 Doc |
|---|--------|---------|-----------|-------------|--------|
| 1 | `runtime-core` | 操作 | 输入, 计算, 存储, 输出 | Coordinates the run lifecycle and action loop. | [runtime-core.md](../L2-modules/runtime-core.md) |
| 2 | `root-entry` | 操作 | — | Registers the `efficiency_subagent` PI extension tool and dispatches to `executeRun()`. | [root-entry.md](../L2-modules/root-entry.md) |

## Runtime Lifecycle

1. Create timeout/signal wrapper.
2. Resolve run identity and continuation state.
3. Create run directory and initialize registry storage/orchestrator.
4. Persist running session state and run-created event.
5. Restore prompt slots on continuation.
6. Load profile and merge project/profile policy.
7. Register profile placeholders and registry entries.
8. Render the full prompt and append the user session message.
9. Execute the configured action sequence with policy enforcement and retry handling.
10. Generate transcript/handoff artifacts.
11. Append run-end event and persist slots/registry state.

## Boundary

The operation layer does not run lifecycle extension scripts or frontend display rendering. Every operation is an explicit action evaluated by the policy engine, then recorded into durable run artifacts.
