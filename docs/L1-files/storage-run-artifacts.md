# L1: `storage/run-artifacts.ts` — Handoff Artifact Generation

**File purpose:** Generates structured handoff artifacts at the end of a subagent run. Constructs the `HandoffBlock` (a comprehensive run summary with filesTouched, toolSummary, blockContext, and transcript excerpt), writes it via `writeHandoff()`, and produces an optional markdown transcript file. Exports helper functions for extracting structured data from raw event entries that are used by the orchestrator for handoff summarization.

**Imports from:** `storage/event-log.ts`, `storage/handoff-store.ts`, `storage/transcript-projector.ts`, and Node `node:fs/promises`, `node:path`.

**Lines:** 227 (extracted from the former monolithic `runner.ts` as part of Phase 3 refactor)

---

## Exports (8)

| Export | Kind | Lines | Description |
|--------|------|-------|-------------|
| `GenerateRunArtifactsInput` | `interface` | 12–24 | Input parameters for artifact generation: `runId`, `profile`, `task`, `status`, `exitCode`, `isContinuation`, `eventCount`, `accomplished`, `includeToolAccomplishments`, `pending`, optional `startedAt`. |
| `GenerateRunArtifactsResult` | `interface` | 26–31 | Return shape: `handoffPath` (always provided), optional `transcriptMarkdown`, `transcriptPath`, and `transcriptError`. |
| `generateRunArtifacts` | `async function` | 33–85 | **Primary function.** Builds transcript, extracts filesTouched/toolSummary/blockContext from raw events, constructs `HandoffBlock`, writes handoff via `writeHandoff()`, logs `handoff_written` event. Returns paths and optional transcript data. |
| `extractFilesTouched` | `function` | 152–167 | Iterates `tool_call` events to extract `{path, operation}` tuples. Uses `mapToolToOperation()` and `extractFilePath()` for field mapping. |
| `mapToolToOperation` | `function` | 169–182 | Maps tool names to file operation types: `"write"`, `"edit"`, `"delete"`, `"bash"`, default `"read"`. |
| `extractFilePath` | `function` | 184–194 | Extracts a file path from tool arguments. For `"bash"` tools, returns the `command` string. For other tools, checks `path` and `filePath` argument keys. |
| `extractToolSummary` | `function` | 196–204 | Counts `tool_call` events per tool name, returns `{toolName, count}[]` for the handoff summary. |
| `extractBlockContext` | `function` | 206–219 | Finds the first `policy_block` event and returns its `reason`, `triggeredBy`, `policyRule`, and `suggestion` for the handoff. Returns `undefined` if no blocks occurred. |

---

## `generateRunArtifacts()` — Artifact Pipeline

The function walks these steps to produce the final handoff:

1. **Transcript build** (line 37) — Calls `generateTranscriptArtifact()` which delegates to `buildTranscript()`; writes `transcript.md` to the run directory on success; logs `transcript_error` event on failure.
2. **Raw event read** (line 38) — Calls `readRawEventsForArtifacts()` which wraps `readEvents()` with an error-safe fallback to `[]`.
3. **Data extraction** (lines 39–41) — Runs `extractFilesTouched()`, `extractToolSummary()`, and `extractBlockContext()` against the raw events.
4. **Accomplished list** (line 42) — Calls `buildAccomplished()`; if `includeToolAccomplishments` is true, appends per-file tool operations and transcript generation note.
5. **Handoff block construction** (lines 44–69) — Assembles `HandoffBlock` with run metadata, summary (task/result/accomplished/pending), artifact paths (events log, tools log, handoff), optional filesTouched, toolSummary, blockContext, startedAt, and a truncated transcript excerpt (first 4000 chars).
6. **Write and event log** (lines 71–77) — Calls `writeHandoff()` to persist the handoff block; logs `handoff_written` event.
7. **Return** (lines 79–85) — Returns `GenerateRunArtifactsResult` with `handoffPath` and optional transcript data.

---

## Internal Functions (not exported)

| Function | Lines | Description |
|----------|-------|-------------|
| `buildAccomplished(input, filesTouched)` | 87–99 | Merges input `accomplished` list with per-file tool operation entries and transcript note when `includeToolAccomplishments` is true. |
| `generateTranscriptArtifact(run, runId)` | 101–126 | Calls `buildTranscript()` to produce markdown; writes `transcript.md` to run directory; returns `{markdown?, path?, error?}`. |
| `readRawEventsForArtifacts(run)` | 128–135 | Reads all events via `readEvents()`; returns `[]` on error (best-effort artifact generation). |
| `summarizeRunResult(status, eventCount)` | 137–146 | Produces a human-readable run result summary string based on status and event count. |
| `stringifyUnknownError(err)` | 148–150 | Error-to-string conversion (instanceof Error or String cast). |
| `eventArguments(event)` | 221–223 | Safely extracts `arguments` field from an EventEntry, returning `{}` if not a record. |
| `isRecord(value)` | 225–227 | Type guard: checks if value is a non-null, non-array object. |

---

## Key Integration Points

- **Event log** — Reads events via `readEvents()` from `storage/event-log.ts` to extract structured summaries.
- **Handoff store** — Calls `writeHandoff()` from `storage/handoff-store.ts` to persist the structured `HandoffBlock`.
- **Transcript** — Calls `buildTranscript()` from `storage/transcript-projector.ts` to produce markdown transcripts.
- **Orchestrator** — Called by `createArtifacts()` in `runtime/orchestrator.ts` at the end of each run.
