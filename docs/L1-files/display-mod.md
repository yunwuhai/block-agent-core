# L1 — `frontend/display/mod.ts`

**Purpose:** Barrel file for display helpers. Re-exports event factories/renderers and the ISO timestamp helper.

## Exports

| Export | Kind | Line | Description |
|---|---|---|---|
| `createEvent` | function | 2 | Create a structured display event. |
| `DEFAULT_TRUNCATION` | const | 3 | Default truncation length. |
| `formatRunStart` | function | 4 | Format run-start event. |
| `formatRunEnd` | function | 5 | Format run-end event. |
| `formatToolCall` | function | 6 | Format tool-call event. |
| `formatToolResult` | function | 7 | Format tool-result event. |
| `formatPolicyBlock` | function | 8 | Format policy-blocked event. |
| `formatSlotChange` | function | 9 | Format prompt-slot mutation event. |
| `formatHandoff` | function | 10 | Format handoff artifact event. |
| `renderCompact` | function | 11 | Render single-line event output. |
| `renderSectioned` | function | 12 | Render grouped event output. |
| `DisplayEvent` | type | 14 | Display event shape. |
| `isoNow` | function | 15 | Return current ISO timestamp. |
