# `storage/mod.ts`

Barrel file for the storage module. Re-exports all public API from four submodules: event logging, handoff persistence, transcript projection, and run artifact generation.

## Exports

### From `./event-log.ts` (lines 1–2)

| Export | Kind | Line |
|---|---|---|
| `createRunDir`, `generateRunId`, `generateRunDirName`, `appendEvent`, `appendSession`, `appendToolLog`, `readEvents`, `sessionExists`, `listRunIds`, `resolveRunsRoot`, `writeSessionState`, `readSessionState`, `formatRunList`, `searchRuns`, `readRunProfile`, `cleanupRuns` | function | 1 |
| `EventEntry`, `ToolLogEntry`, `RunDirectory`, `SessionState`, `RunSearchQuery`, `CleanupPolicy` | type | 2 |

### From `./handoff-store.ts` (lines 3–4)

| Export | Kind | Line |
|---|---|---|
| `writeHandoff` | function | 3 |
| `HandoffBlock` | type | 4 |

### From `./transcript-projector.ts` (lines 5–6)

| Export | Kind | Line |
|---|---|---|
| `buildTranscript`, `buildJsonTranscript` | function | 5 |
| `TranscriptView`, `TranscriptOptions` | type | 6 |

### From `./run-artifacts.ts` (lines 7–8)

| Export | Kind | Line |
|---|---|---|
| `generateRunArtifacts`, `extractFilesTouched`, `mapToolToOperation`, `extractFilePath`, `extractToolSummary`, `extractBlockContext` | function | 7 |
| `GenerateRunArtifactsInput`, `GenerateRunArtifactsResult` | type | 8 |

## Purpose

Single import point for all storage-layer operations — callers import from `./storage/mod.ts` rather than individual files.
