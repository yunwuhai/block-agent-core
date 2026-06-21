# `display/mod.ts` — Display module barrel

**Purpose:** Barrel file that re-exports all public symbols from the display sub-modules. Consumers import from `display/mod.ts` (or `display/`) rather than individual files.

## Exports

| Export | Kind | Line | Description |
|--------|------|------|-------------|
| `createEvent` | function | 2 | Create a structured display event |
| `DEFAULT_TRUNCATION` | constant | 3 | Default truncation length for event fields |
| `formatRunStart` | function | 4 | Format a run-started event for TUI output |
| `formatRunEnd` | function | 5 | Format a run-completed event for TUI output |
| `formatToolCall` | function | 6 | Format a tool-call event for TUI output |
| `formatToolResult` | function | 7 | Format a tool-result event for TUI output |
| `formatHook` | function | 8 | Format a hook execution event for TUI output |
| `formatPolicyBlock` | function | 9 | Format a policy-blocked action for TUI output |
| `formatHookBlock` | function | 10 | Format a hook-blocked action for TUI output |
| `formatSlotChange` | function | 11 | Format a prompt-slot change event for TUI output |
| `formatHandoff` | function | 12 | Format a structured handoff event for TUI output |
| `renderCompact` | function | 13 | Render events in compact (single-line) mode |
| `renderSectioned` | function | 14 | Render events in sectioned (multi-line) mode |
| `DisplayEvent` | type | 16 | Type definition for a display event |
| `isoNow` | function | 17 | Get current timestamp in ISO-8601 format |

## Dependencies

- `./events.ts` — event creation, formatting, and rendering functions
- `./iso-now.ts` — ISO timestamp utility
