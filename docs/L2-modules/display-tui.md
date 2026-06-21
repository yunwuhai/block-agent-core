# L2 Module: Display TUI

**Purpose:** Terminal UI event formatting. Defines `DisplayEvent`, factories for run/tool/policy/slot/handoff events, and compact/sectioned renderers.

## Member Files

| L1 Doc | Source File | Role |
|---|---|---|
| `display-iso-now.md` | `frontend/display/iso-now.ts` | ISO timestamp helper. |
| `display-events.md` | `frontend/display/events.ts` | Event model, factories, renderers, ANSI sanitization. |
| `display-mod.md` | `frontend/display/mod.ts` | Barrel re-export. |

## Export Groups

- Event model: `DisplayEvent`
- Factories: `createEvent`, `formatRunStart`, `formatRunEnd`, `formatToolCall`, `formatToolResult`, `formatPolicyBlock`, `formatSlotChange`, `formatHandoff`
- Renderers: `renderCompact`, `renderSectioned`
- Utilities: `DEFAULT_TRUNCATION`, `isoNow`

## Notes

- Lifecycle-script display events were removed with that subsystem.
