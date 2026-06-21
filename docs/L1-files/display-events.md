# `display/events.ts` — Display Event formatting

**Purpose:** Defines the `DisplayEvent` data model and all factory/renderer functions for the TUI event stream. Every event type (run, tool, hook, policy, slot, handoff) flows through this module for structured creation, ANSI sanitization, truncation, and compact or sectioned rendering.

## Exports

| # | Export | Kind | Lines | Description |
|---|--------|------|-------|-------------|
| 1 | `DisplayEvent` | interface | 3–13 | Immutable event shape: `type`, `timestamp`, `label`, `detail`, `status`, and optional `expandable` section. |
| 2 | `DEFAULT_TRUNCATION` | const (80) | 19 | Default character limit for inline `detail`; longer content becomes expandable. |
| 3 | `createEvent()` | function | 30–50 | Factory that stamps the current ISO timestamp, sanitizes ANSI escapes from user strings, and returns a `DisplayEvent`. |
| 4 | `formatRunStart()` | function | 56–63 | Wrapper: `run_start` event with `running` status. |
| 5 | `formatRunEnd()` | function | 65–72 | Wrapper: `run_end` event; status depends on `success`. |
| 6 | `formatToolCall()` | function | 74–86 | Wrapper: `tool_call` event; truncates args at `DEFAULT_TRUNCATION`, stores full JSON in `expandable`. |
| 7 | `formatToolResult()` | function | 88–99 | Wrapper: `tool_result` event; truncates output, stores full body in `expandable`. |
| 8 | `formatHook()` | function | 101–108 | Wrapper: `hook` event for before/after hooks. |
| 9 | `formatPolicyBlock()` | function | 110–117 | Wrapper: `policy` event with `blocked` status. |
| 10 | `formatHookBlock()` | function | 119–126 | Wrapper: `policy`-typed event with `blocked` status (hook rejection). |
| 11 | `formatSlotChange()` | function | 130–137 | Wrapper: `slot` event (available, not wired into runner). |
| 12 | `formatHandoff()` | function | 141–148 | Wrapper: `handoff` event (available, not wired into runner). |
| 13 | `renderCompact()` | function | 162–174 | One-line per event with status icon (✅ ❌ 🚫 ⏳) and optional ANSI color. |
| 14 | `renderSectioned()` | function | 196–222 | Groups events by phase (`Run`, `Tool Calls`, `Hooks`, …), renders each group with a header. |

## Internal

| Symbol | Kind | Lines | Description |
|--------|------|-------|-------------|
| `sanitize()` | function | 22–24 | Strips ANSI escape sequences to prevent terminal injection. |
| `COLORS` | const | 150–156 | ANSI color map per status. |
| `PHASE_MAP` | const | 185–194 | Maps event `type` to section header label. |
