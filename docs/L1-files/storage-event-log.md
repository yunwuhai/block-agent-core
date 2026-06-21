# `storage/event-log.ts` — Run directory management & JSONL event logging

**Purpose:** Manage subagent run directories under `.pi/subagents/runs/` — create, persist session state, append JSONL event/tool/session entries, read back, search, format listings, and apply retention cleanup. The primary I/O layer for all durable run artifacts.

---

## Exports

### Interfaces

| Name | Lines | Description |
|---|---|---|
| `EventEntry` | 6–11 | Generic JSONL entry: `timestamp`, `runId`, `event`, plus arbitrary keys |
| `ToolLogEntry` | 13–22 | Structured tool-call log: event type (`"call"`/`"result"`), `toolName`, `toolCallId`, optional `arguments`/`output`/`isError` |
| `SessionState` | 24–30 | Session metadata persisted to `session.json`: `runId`, `startedAt`, `status`, optional `profile`/`task` |
| `RunDirectory` | 32–40 | Path bundle for one run: `dir`, `sessionPath`, `sessionStatePath`, `eventsPath`, `toolsPath`, `handoffPath` |
| `RunSearchQuery` | 260–267 | Filter for `searchRuns`: `eventType`, `toolName`, `since`/`until` (ISO), `profile`, `status` |
| `CleanupPolicy` | 326–330 | Policy for `cleanupRuns`: `maxRuns` (count), `maxAgeMs`, `keepStatuses` |

### Functions

| Name | Lines | Description |
|---|---|---|
| `resolveRunsRoot(cwd)` | 44–46 | Resolve `.pi/subagents/runs` relative to `cwd` |
| `generateRunId()` | 48–50 | Return a 12-character hex UUID fragment |
| `generateRunDirName(profile, task)` | 52–58 | Build a human-readable directory name: `{profile}-{task}-{timestamp}-{suffix}` |
| `createRunDir(cwd, runId?, profile?, task?)` | 60–111 | Create fresh run directory + write initial `session.json`; reuse if already exists |
| `writeSessionState(run, status)` | 113–125 | Overwrite `session.json` with updated status, preserving `startedAt` |
| `readSessionState(run)` | 136–142 | Parse and return `SessionState` from `session.json` (or `null`) |
| `appendEvent(run, entry)` | 144–149 | Append one `EventEntry` as JSONL to `events.jsonl` |
| `appendSession(run, entry)` | 151–156 | Append one `EventEntry` as JSONL to `session.jsonl` |
| `appendToolLog(run, entry)` | 158–163 | Append one `ToolLogEntry` as JSONL to `tools.jsonl` |
| `readEvents(run)` | 165–173 | Parse all lines from `events.jsonl` into `EventEntry[]` |
| `readRunProfile(cwd, runId)` | 175–189 | Read `profile` field from a specific run's `session.json` |
| `sessionExists(cwd, runId)` | 191–196 | Check whether a run directory exists |
| `listRunIds(cwd)` | 198–203 | List all run directory basenames under the runs root |
| `formatRunList(cwd)` | 222–258 | Format a human-readable summary of all runs with status icons |
| `searchRuns(cwd, query)` | 269–324 | Scan all runs matching `RunSearchQuery` filters and return matching events |
| `cleanupRuns(cwd, policy)` | 332–394 | Delete runs exceeding age/count limits, respecting `keepStatuses`; returns count removed |
