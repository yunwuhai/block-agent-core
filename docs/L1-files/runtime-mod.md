# `runtime/mod.ts`

Barrel file for the runtime module. Re-exports the execution orchestrator and its associated types from `./runner.ts`.

## Exports

### From `./runner.ts` (lines 1–2)

| Export | Kind | Line |
|---|---|---|
| `executeRun` | function | 1 |
| `RunContext` | type | 2 |
| `RunResult` | type | 2 |

## Purpose

Single import point for the top-level run orchestration — callers import `executeRun`, `RunContext`, and `RunResult` from `./runtime/mod.ts` rather than the internal `./runner.ts` directly.
