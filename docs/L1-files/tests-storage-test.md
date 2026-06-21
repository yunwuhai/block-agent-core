# tests/storage.test.ts

**Purpose:** Integration tests for the storage layer of the efficiency-subagent — run directories, event logs, sessions, tool logs, handoff files, and transcript projection.

**Test suite: `Storage event log`** (lines 30–98)

All tests share a temp directory (`/tmp/efficiency-subagent-test-*`) created fresh in `beforeEach` and recursively removed in `afterEach`.

| Test | Lines | What it verifies |
|---|---|---|
| creates a run directory | 31–37 | `generateRunId()` + `createRunDir()` produce a `.pi/subagents/runs/` path that exists on disk |
| appends and reads events | 39–47 | An `EventEntry` written via `appendEvent` is returned intact by `readEvents` |
| appends session entries | 49–54 | `appendSession` creates the session JSONL file at `run.sessionPath` |
| appends tool log entries | 56–62 | `appendToolLog` creates the tools JSONL file at `run.toolsPath` |
| checks session existence | 64–69 | `sessionExists` returns true for an existing run, false for a nonexistent one |
| lists run ids | 71–79 | After creating two runs, `listRunIds` returns both, and only those two |
| writeHandoff creates handoff.md | 82–88 | `writeHandoff` writes a handoff file at `<run.dir>/handoff.md` with correct metadata |
| buildTranscript generates markdown | 90–98 | Given a `run_start` + `run_end` event pair, `buildTranscript` returns markdown containing "Run Started" and "Run completed" |

**Key imports under test:** `storage/mod.ts` (event log, sessions, tool logs, run dirs), `storage/handoff-store.ts`, `storage/transcript-projector.ts`.
