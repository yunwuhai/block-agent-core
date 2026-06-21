# `tests/display.test.ts`

## File Purpose

Unit tests for the display event formatting layer (`display/mod.ts`), which converts
runtime lifecycle events into structured `DisplayEvent` objects and renders compact
TUI lines. Every exported formatter (`format*`) and the compact renderer is exercised.

## Test Suite

### `describe("Display events format")` — line 14

Single flat suite covering all event types. Each test imports the corresponding
formatter from `../display/mod.ts` and asserts on `type`, `status`, `label`,
`detail`, and optional `expandable` fields.

| Test | Lines | What it verifies |
|------|-------|------------------|
| `formatRunStart returns running status` | 15–19 | `run_start` event sets `status: "running"` with profile and task |
| `formatRunEnd returns ok for success` | 21–25 | `run_end` event sets `status: "ok"` when success is true |
| `formatRunEnd returns error for failure` | 27–30 | Same formatter sets `status: "error"` when success is false |
| `formatToolCall includes expandable args when content exceeds threshold` | 32–38 | Large args (≥80 chars) produce `expandable` with body |
| `formatToolCall omits expandable for small args` | 40–44 | Small args produce no `expandable` field |
| `formatToolResult truncates long output in detail` | 46–52 | Output >80 chars is truncated in `detail` and stored in `expandable` |
| `formatHook shows phase and script` | 54–58 | Hook event sets `status: "ok"` and includes phase label |
| `formatPolicyBlock shows blocked status` | 60–63 | Policy event sets `status: "blocked"` |
| `formatSlotChange shows operation` | 65–69 | Slot event sets `type: "slot"` and operation in label |
| `formatHandoff shows path` | 71–75 | Handoff event sets `type: "handoff"` and `status: "ok"` |
| `renderCompact for blocked event` | 77–81 | Rendered string contains block emoji |
| `renderCompact for ok event` | 83–87 | Rendered string contains check emoji |

## Key Scenarios Covered

- **Success/failure branching** — `formatRunEnd` tested with both polarities
- **Expandable threshold** — tool calls and results are tested above and below the
  80-char `DEFAULT_TRUNCATION` boundary
- **All lifecycle events** — run start/end, tool call/result, hook, policy block,
  slot change, handoff
- **Compact rendering** — verifies the renderer produces expected emoji for
  blocked vs. ok statuses
