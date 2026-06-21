# L3 Architecture: Frontend — 显示 (Display)

The display layer formats structured events for the terminal.

## Member Modules

| # | Module | Primary | Description | L2 Doc |
|---|--------|---------|-------------|--------|
| 1 | `display-tui` | 显示 | Defines `DisplayEvent`, event factory functions, compact rendering, and sectioned rendering. | [display-tui.md](../L2-modules/display-tui.md) |

## Event Surface

Current display events cover run start/end, tool calls/results, policy blocks, slot changes, handoff/transcript artifacts, and generic custom events. Display code does not execute tools or mutate durable state.
