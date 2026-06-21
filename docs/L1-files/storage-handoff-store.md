# `storage/handoff-store.ts`

**Purpose:** Define handoff block data structures and generate rich markdown handoff documents for session continuity. Each completed (or failed/blocked) run produces a `.handoff.md` file that captures metadata, summary, files touched, tool usage, artifacts, and block context.

## Exports

| # | Export | Kind | Lines | Description |
|---|--------|------|-------|-------------|
| 1 | `FileTouch` | `interface` | 4–7 | A single file operation during a run — `path` plus one of `read`, `write`, `edit`, `delete`, `bash`. |
| 2 | `ToolSummary` | `interface` | 9–12 | Aggregate count of calls for a single tool name. |
| 3 | `HandoffBlock` | `interface` | 14–41 | Complete handoff metadata: run identity (`runId`, `profile`), task/agent/model, status/exit code, timing, summary (task/result/accomplished/pending), file and tool usage, artifacts, optional block context for blocked/failed runs, and raw `finalOutput`. |
| 4 | `writeHandoff` | `function` | 63–199 | Accepts `RunDirectory` and a `HandoffBlock`; assembles a structured markdown document (metadata table, summary sections, files touched table, tool summary table, final output, artifact list, collapsible transcript, block context) and writes it to `run.handoffPath`. Returns the written path. |

## Internals

| Symbol | Kind | Lines | Description |
|--------|------|-------|-------------|
| `STATUS_ICON` | `const` | 47–51 | Maps status (`completed`, `failed`, `blocked`) to emoji icons. |
| `table` | `function` | 53–61 | Renders a 2-column markdown table from `[field, value][]` pairs. |
