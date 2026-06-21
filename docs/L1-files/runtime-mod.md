# L1 — `frontend/operation/mod.ts`

**Purpose:** Barrel file for operation-layer execution. Re-exports the run orchestrator and tool simulator entry points.

## Exports

| Export | Kind | Line | Description |
|---|---|---|---|
| `executeRun` | function | 1 | Top-level run lifecycle entry point. |
| `RunContext` | type | 2 | Input shape for `executeRun()`. |
| `RunResult` | type | 2 | Result shape from `executeRun()`. |
| `executeWithRetry` | function | 3 | Retry wrapper around one tool interaction. |
| `simulateToolInteraction` | function | 3 | Single-tool simulated execution pipeline. |
| `ToolInteractionResult` | type | 4 | Output/blocking result from tool execution. |
