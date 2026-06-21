# L1 — `frontend/display/events.ts`

**Purpose:** Defines the `DisplayEvent` model and formatting/rendering helpers for the TUI event stream. Current event types cover run lifecycle, tool calls/results, policy blocks, slot changes, and handoff artifacts.

## Exports

| Export | Kind | Lines | Description |
|---|---|---|---|
| `DisplayEvent` | interface | 3–13 | Immutable event shape: `type`, `timestamp`, `label`, `detail`, `status`, optional `expandable`. |
| `DEFAULT_TRUNCATION` | const | 19 | Default inline detail truncation length. |
| `createEvent()` | function | 30–52 | Creates timestamped, ANSI-sanitized display events and omits absent optional fields. |
| `formatRunStart()` | function | 58–65 | Creates a `run_start` event. |
| `formatRunEnd()` | function | 67–74 | Creates a `run_end` event with success/failure status. |
| `formatToolCall()` | function | 76–88 | Creates a `tool_call` event and stores long args in `expandable`. |
| `formatToolResult()` | function | 90–101 | Creates a `tool_result` event and stores long output in `expandable`. |
| `formatPolicyBlock()` | function | 103–110 | Creates a blocked `policy` event. |
| `formatSlotChange()` | function | 114–121 | Creates a `slot` mutation event. |
| `formatHandoff()` | function | 125–132 | Creates a `handoff` event. |
| `renderCompact()` | function | 146–158 | Renders one event as a single colored line with status icon. |
| `renderSectioned()` | function | 179–205 | Groups events by phase and renders section headers. |

## Internal

| Symbol | Kind | Lines | Description |
|---|---|---|---|
| `sanitize()` | function | 22–24 | Strips ANSI escapes from display strings. |
| `COLORS` | const | 134–140 | ANSI color map by status. |
| `PHASE_MAP` | const | 169–177 | Maps event type to section header. |
