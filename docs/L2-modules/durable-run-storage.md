# L2 Module: Durable Run Storage

**Purpose:** Manages the persistent lifecycle of subagent runs under `.pi/subagents/runs/` — creates run directories, writes and reads JSONL event/tool/session logs, searches across runs, formats run listings, and applies retention cleanup policies.

## Member Files

| L1 Doc | Summary |
|--------|---------|
| `storage-event-log.md` | Core I/O layer for all durable run artifacts. Creates run directories with deterministic naming, manages `session.json` state, appends typed entries to `events.jsonl` / `session.jsonl` / `tools.jsonl`, reads back events, searches runs by filters (`RunSearchQuery`), formats human-readable run listings, and cleans up old runs per `CleanupPolicy`. |

## Intra-Module Relationships

- Single-file module. All run directory lifecycle operations (create, write, read, search, list, cleanup) are co-located in one file because they operate on the same directory structure and `RunDirectory` path bundle.

## External Dependencies

- **None.** This module is the foundation of the storage layer — all other storage modules depend on it for data access.

## Physical Location

| Source File | Current Path | Notes |
|------------|-------------|-------|
| `storage/event-log.ts` | `backend/storage/event-log.ts` | Run directory lifecycle, JSONL I/O, search, listing, cleanup |

> **Step 4 reorganization status: COMPLETE.** Durable run storage now lives in the Backend 存储 layer under `backend/storage/`.

## Notes

- `RunDirectory` bundles paths for: run directory, `session.json`, `events.jsonl`, `tools.jsonl`, and `handoff.md`.
- `generateRunDirName()` produces human-readable names: `{profile}-{task}-{timestamp}-{hexSuffix}`.
- The `backend/storage/mod.ts` barrel (`storage-mod.md`) re-exports all public functions and types from this module alongside Handoff and Transcript exports.
