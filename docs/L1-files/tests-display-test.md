# L1 — `frontend/display/display.test.ts`

**Purpose:** Unit tests for display event formatting and compact rendering.

## Suite

`describe("Display events format")` covers all exported display formatters and `renderCompact()`.

| Test | Lines | Verifies |
|---|---|---|
| `formatRunStart returns running status` | 14–18 | `run_start` event and running status. |
| `formatRunEnd returns ok for success` | 20–24 | Successful `run_end` status. |
| `formatRunEnd returns error for failure` | 26–29 | Failed `run_end` status. |
| `formatToolCall includes expandable args when content exceeds threshold` | 31–37 | Large args produce expandable body. |
| `formatToolCall omits expandable for small args` | 39–43 | Small args omit expandable. |
| `formatToolResult truncates long output in detail` | 45–51 | Long output is truncated and expandable. |
| `formatPolicyBlock shows blocked status` | 53–56 | Policy event is blocked. |
| `formatSlotChange shows operation` | 58–62 | Slot mutation event. |
| `formatHandoff shows path` | 64–68 | Handoff event. |
| `renderCompact for blocked event` | 70–74 | Blocked icon output. |
| `renderCompact for ok event` | 76–80 | OK icon output. |
