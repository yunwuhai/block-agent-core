# L2 Module: Run Artifact Generation

**Purpose:** Produce structured, formatted output artifacts from raw run event data — handoff markdown documents for session continuity across subagent invocations, and human-readable transcripts for review and debugging.

## Member Files

| L1 Doc | Summary |
|--------|---------|
| `storage-run-artifacts.md` | Defines `HandoffBlock` (run metadata, summary, files touched, tool usage, artifacts, block context) and `writeHandoff()` which assembles a rich `.handoff.md` markdown document from a `RunDirectory` + `HandoffBlock`. |
| `storage-run-artifacts.md` (via `buildHandoff`/`buildTranscript`) | Defines `TranscriptView` (markdown string) and `buildTranscript()` / `buildJsonTranscript()` — reads events via `readEvents()` from the event log, formats each event variant (`run_start`, `tool_call`, `policy_block`, etc.) as markdown sections, and returns a readable transcript. |

## Intra-Module Relationships

- Both files share the same architectural pattern: take a `RunDirectory` (or event data from it), transform into formatted output, write or return the result.
- They serve complementary output needs — **handoff** is for the next subagent invocation (machine-consumable context), **transcript** is for human review and debugging.
- **No direct dependency between them** — they share a common dependency on Durable Run Storage but do not call or import each other.

## External Dependencies

| Depends on (L1 doc) | Used by | How used |
|---------------------|---------|----------|
| `storage-event-log.md` | `storage-run-artifacts.md` | Imports `RunDirectory` type — `writeHandoff()` receives a `RunDirectory` to resolve the `handoffPath`. |
| `storage-event-log.md` | `storage-run-artifacts.md` (via `buildHandoff`/`buildTranscript`) | Imports `EventEntry`, `ToolLogEntry`, `RunDirectory` types; calls `readEvents(run)` to get raw events for transcript formatting. |

## Physical Location

| Source File | Current Path | Notes |
|------------|-------------|-------|
| `storage/handoff-store.ts` | `backend/output/handoff-store.ts` | `writeHandoff()` — assembles `.handoff.md` markdown document |
| `storage/transcript-projector.ts` | `backend/output/transcript-projector.ts` | `buildTranscript()`, `buildJsonTranscript()` — human-readable transcripts |

> **Step 4 reorganization status: COMPLETE.** Handoff and transcript projection now live in the Backend 输出 layer under `backend/output/`.

## Notes

- Handoff includes collapsible `<details>` sections for raw final output, allowing machine consumers to parse structured fields while keeping the document compact.
- Transcript truncates tool output to `maxOutputLength` chars (configurable via `TranscriptOptions`); pass `-1` for unlimited.
- Re-exported types (`EventEntry`, `ToolLogEntry`, `RunDirectory`) from `storage-run-artifacts.md` (via `buildHandoff`/`buildTranscript`) exist for consumer convenience — the canonical definitions live in `storage-event-log.md`.
- The `backend/storage/mod.ts` barrel (`storage-mod.md`) re-exports `writeHandoff`, `HandoffBlock`, `buildTranscript`, `buildJsonTranscript`, `TranscriptView`, and `TranscriptOptions` from the output layer for compatibility.
