# Module: display-tui

**Purpose:** Terminal UI event formatting. Defines the `DisplayEvent` data model and provides factory functions to create structured events for every lifecycle phase (run start/end, tool calls, hook execution, policy blocks, slot changes, handoff), plus two renderers — compact single-line and sectioned multi-line — for terminal output.

## Member Files

| L1 Doc | Source File | Role |
|--------|-------------|------|
| [display-iso-now.md](../L1-files/display-iso-now.md) | `frontend/display/iso-now.ts` | Single-source timestamp utility — `isoNow()` |
| [display-events.md](../L1-files/display-events.md) | `frontend/display/events.ts` | Event model, 10 factory functions, 2 renderers, ANSI sanitization |
| [display-mod.md](../L1-files/display-mod.md) | `frontend/display/mod.ts` | Barrel — re-exports all public symbols from both sub-modules |

## Per-File Contribution Summary

### frontend/display/iso-now.ts
Trivial zero-dependency utility: `isoNow()` returns `new Date().toISOString()`. Centralizes the timestamp call so every module gets consistent ISO 8601 timestamps from the same import. Created by proposal `tui-002` to deduplicate the pattern across display and operation code.

### frontend/display/events.ts
The core of the module. Contains:
- **Data model**: `DisplayEvent` interface (type, timestamp, label, detail, status, optional expandable section)
- **Factory functions** (10 total): `createEvent()` (base), `formatRunStart()`, `formatRunEnd()`, `formatToolCall()`, `formatToolResult()`, `formatHook()`, `formatPolicyBlock()`, `formatHookBlock()`, `formatSlotChange()`, `formatHandoff()`
- **Renderers** (2): `renderCompact()` — one-line per event with status icons (✅ ❌ 🚫 ⏳) and ANSI color; `renderSectioned()` — groups events by phase with headers
- **Utilities**: `sanitize()` strips ANSI escapes to prevent terminal injection; `DEFAULT_TRUNCATION` (80 chars) controls inline detail length; `COLORS` and `PHASE_MAP` constants
- **Truncation logic**: Inline `detail` truncated at 80 chars; full content stored in `expandable` for sectioned rendering

### frontend/display/mod.ts
Barrel re-exporting 15 symbols: 12 formatting functions, 1 type (`DisplayEvent`), 1 constant (`DEFAULT_TRUNCATION`), and 1 utility (`isoNow`). Consumers import from `frontend/display/mod.ts`.

## Internal Relationships

```
frontend/display/iso-now.ts  ──provides──▶  isoNow()  ──called by──▶  frontend/display/events.ts (createEvent factory)
                                                                       │
                    ┌──────────────────────────────────────────────────┘
                    ▼
frontend/display/mod.ts  (re-exports isoNow + all events.ts symbols)
```

- **iso-now → events**: `createEvent()` calls `isoNow()` to stamp every event. Loose coupling — events.ts only depends on the `isoNow` signature.
- **mod → both**: Barrel depends on both sub-modules.

## External Dependencies

### Consumers (who depends on this module)
| L1 Doc | Relationship |
|--------|-------------|
| [index.md](../L1-files/index.md) | Imports `renderCompact` and `renderSectioned` to render execution results in the TUI |
| [runtime-runner.md](../L1-files/runtime-runner.md) | Calls event factory functions (`formatRunStart`, `formatToolCall`, etc.) during subagent execution to build the event stream |

### Upstream (what this module depends on)
| L1 Doc | Relationship |
|--------|-------------|
| None | Display module is self-contained — all types, factories, and renderers are defined internally. No imports from other extension modules. |

## Physical Location

| Source File | Current Path | Notes |
|------------|-------------|-------|
| `display/iso-now.ts` | `frontend/display/iso-now.ts` | `isoNow()` timestamp utility |
| `display/events.ts` | `frontend/display/events.ts` | `DisplayEvent` model, 10 factory functions, 2 renderers |
| `display/mod.ts` | `frontend/display/mod.ts` | Barrel re-exporting 15 symbols |

> **Step 4 reorganization status: COMPLETE.** Display files now live in the Frontend 显示 layer under `frontend/display/`.

### Notes
- `formatSlotChange()` and `formatHandoff()` are defined and exported but noted as "not wired into runner" — available for future integration.
- ANSI color codes are embedded in `COLORS` map; terminal compatibility depends on the consuming TUI renderer.
