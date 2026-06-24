# L1 — `index.ts`

**Purpose:** Extension entry point. Registers the single PI tool exposed by this package. Delegates to `backend/entry/index.ts` for programmatic use. The primary public API is now at `backend/entry/index.ts` (`executeRun()`).

## Exports

| Export | Kind | Lines | Description |
|---|---|---|---|
| `default` | function | 34--148 | Receives `ExtensionAPI` and registers `efficiency_subagent`. |

## Internal Functions

| Name | Lines | Description |
|---|---|---|
| `renderText` | 27--32 | TUI-compatible renderable text wrapper with `render(width)` and `invalidate()`. |

## Tool: `efficiency_subagent`

- Registered at lines 35--147.
- Parameters: `profile`, `task`, optional `runId`, optional `actions`, optional `schedule`.
- Execute path: reset prompt engine state, validate params with `ToolParamsSchema`, call `executeRun()` from `backend/entry/index.ts`, return a compact text summary and structured `details` with artifact paths. Invalid params and caught failures return empty results with `terminate: true`.
- Capability boundary: durable session recording, assembly pipeline context control, action sequence execution, and policy enforcement.

## Notes

- This file is the **PI extension tool registration** — the external-facing hook for the PI Agent host.
- The **programmatic API** (`executeRun()`) lives at `backend/entry/index.ts` and re-exports all core modules.
- Lifecycle scripts are not registered.
