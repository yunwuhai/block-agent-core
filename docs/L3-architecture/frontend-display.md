# L3 Architecture: Frontend — 显示 (Display)

Layer for modules that format and present information to human users — TUI event rendering, output formatting, terminal visualization.

> **Quadrant definition:** Modules that format/present information to users (TUI, event rendering, output formatting).

## Member Modules

| # | Module | Primary | Description | L2 Doc |
|---|--------|---------|-------------|--------|
| 1 | `display-tui` | 显示 | Terminal UI event formatting: `DisplayEvent` data model, factory functions for lifecycle events, compact/sectioned renderers with ANSI styling. | [display-tui.md](../L2-modules/display-tui.md) |

## Module Detail: `display-tui`

**Purpose:** Terminal UI event formatting for the subagent lifecycle. Defines the `DisplayEvent` data model and provides factory functions to create structured events for every lifecycle phase (run start/end, tool calls, hook execution, policy blocks, slot changes, handoff), plus two renderers — compact single-line and sectioned multi-line — for terminal output.

### Member L1 Files

| L1 Doc | Source File | Role |
|--------|-------------|------|
| `display-iso-now.md` | `display/iso-now.ts` | Centralized ISO 8601 timestamp utility — `isoNow()` |
| `display-events.md` | `display/events.ts` | Core: `DisplayEvent` model, 10 factory functions, 2 renderers, ANSI sanitization |
| `display-mod.md` | `display/mod.ts` | Barrel re-exporting 15 public symbols |

### Key Exports

- **Data model:** `DisplayEvent` — `{type, timestamp, label, detail, status, expandable}`
- **Factory functions (10):** `createEvent()`, `formatRunStart()`, `formatRunEnd()`, `formatToolCall()`, `formatToolResult()`, `formatHook()`, `formatPolicyBlock()`, `formatHookBlock()`, `formatSlotChange()`, `formatHandoff()`
- **Renderers (2):** `renderCompact()` — one-line per event with status icons (✅ ❌ 🚫 ⏳); `renderSectioned()` — groups events by phase with headers
- **Utilities:** `sanitize()` strips ANSI escapes; `isoNow()` provides consistent timestamps

### Dependencies

- **Imports from:** None. Self-contained — all types, factories, and renderers are internal.
- **Imported by:** `root-entry` (index.ts) for TUI rendering; `runtime-core` (runner.ts) for event factory calls during execution.

### Why This Classification

`display-tui` is the **purest display module** in the system. It has no computation beyond formatting, no storage, no input parsing. Its sole purpose is to take structured event data and produce formatted terminal output for the human user. The module is entirely self-contained with zero dependencies on other extension modules, making it an ideal candidate for the 显示 layer.

## Layer Position in Architecture

```
┌──────────────────────────────────────────────────┐
│                  FRONTEND                         │
│  ┌────────────────┐  ┌────────────────────────┐  │
│  │   显示 (Display) │  │  操作 (Operation)       │  │
│  │   display-tui   │  │  runtime-core          │  │
│  │                 │  │  root-entry            │  │
│  └────────────────┘  └────────────────────────┘  │
├──────────────────────────────────────────────────┤
│                  BACKEND                          │
│  ┌──────┐ ┌───────┐ ┌─────────┐ ┌────────────┐  │
│  │ 输入  │ │ 输出   │ │ 存储     │ │ 计算        │  │
│  └──────┘ └───────┘ └─────────┘ └────────────┘  │
└──────────────────────────────────────────────────┘
```

The 显示 layer is the **terminal output surface** — it consumes events from the backend and operation layers and renders them for user consumption. It has no knowledge of business logic, storage, or computation.
