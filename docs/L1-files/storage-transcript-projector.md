# `storage/transcript-projector.ts`

## Purpose

Formats a run's event log into a human-readable Markdown transcript. Consumes `EventEntry[]` from `event-log.ts` and projects it as `TranscriptView` (markdown string) or raw JSON.

## Exports

| Export | Kind | Lines | Description |
|---|---|---|---|
| `TranscriptView` | interface | 4–8 | Result shape: `runId`, `markdown` string, optional `events[]` |
| `TranscriptOptions` | interface | 10–13 | Options: `includeJson` (attach raw events), `maxOutputLength` (truncate tool output) |
| `buildTranscript()` | async fn | 15–34 | Read events via `readEvents(run)`, format each with `formatEvent()`, join as Markdown. Returns `TranscriptView` |
| `buildJsonTranscript()` | async fn | 36–40 | Read events and return raw `EventEntry[]` without formatting |
| `EventEntry` | type re-export | 73 | Re-exported from `event-log.ts` |
| `ToolLogEntry` | type re-export | 73 | Re-exported from `event-log.ts` |
| `RunDirectory` | type re-export | 74 | Re-exported from `event-log.ts` |

### Private

- **`formatEvent(e, maxOutputLength)`** (line 42–71) — Maps each `EventEntry.event` variant (`run_start`, `run_end`, `tool_call`, `tool_result`, `hook_exec`, `policy_block`, `slot_mutation`, `handoff_written`) to a Markdown section heading + details. Tool output is truncated to `maxOutputLength` characters (pass `-1` for no limit).
