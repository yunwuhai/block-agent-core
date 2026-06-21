# L1 — `index.ts`

**Purpose:** Extension entry point. Registers the single PI tool exposed by this package.

## Exports

| Export | Kind | Lines | Description |
|---|---|---|---|
| `default` | function | 36–151 | Receives `ExtensionAPI` and registers `efficiency_subagent`. |

## Internal Functions

| Name | Lines | Description |
|---|---|---|
| `renderText` | 29–34 | TUI-compatible renderable text wrapper with `render(width)` and `invalidate()`. |

## Tool: `efficiency_subagent`

- Registered at lines 37–150.
- Parameters: `profile`, `task`, optional `runId`, optional `actions`.
- Execute path: reset prompt engine state, validate params with `ToolParamsSchema`, call `executeRun()`, render sectioned event output, and return structured `details`. Invalid params and caught failures return empty results with `terminate: true`.
- Capability boundary: durable session recording, prompt registry control, action sequence execution, and policy enforcement. Lifecycle scripts are no longer registered or described.
