/**
 * storage/event-log.ts — Structured event logging and session persistence.
 *
 * =============================================================================
 *  Low-level file operations for the run's event log (events.jsonl) and
 *  session state (session.json).
 *
 *  All functions take a `runDir: string` path directly — no RunDirectory
 *  wrapper — so they can be used in contexts where only the path is available.
 * =============================================================================
 */

import { appendFile, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Event
// ---------------------------------------------------------------------------

/**
 * A single structured event in the run's JSONL event log.
 *
 * Every event has a `type` (the event kind), a `timestamp` (ISO 8601), and a
 * `data` payload whose shape depends on the event type.
 *
 * Known event types and their data shapes:
 *
 * | type               | data fields                                                  |
 * |--------------------|--------------------------------------------------------------|
 * | `run_start`        | `{ profile, task, runId, isContinuation }`                   |
 * | `run_continue`     | `{ runId, restoredFrom }`                                    |
 * | `run_end`          | `{ status, duration }`                                       |
 * | `tool_call`        | `{ tool, args }`                                             |
 * | `tool_result`      | `{ tool, status, output }`                                   |
 * | `policy_block`     | `{ tool, args, reason }`                                     |
 * | `mount`            | `{ entries: { id, name, reason, tokens }[] }`                |
 * | `unmount`          | `{ entryIds: string[] }`                                     |
 * | `entry_injected`   | `{ id, name, reason, tokens }`                               |
 * | `entry_excluded`   | `{ id, name, reason, detail }`                               |
 * | `handoff_written`  | `{ path }`                                                   |
 */
export interface Event {
  readonly type: string;
  readonly timestamp: string;
  readonly data: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// File names
// ---------------------------------------------------------------------------

const EVENTS_FILE = "events.jsonl";
const SESSION_FILE = "session.json";

// ---------------------------------------------------------------------------
// appendEvent
// ---------------------------------------------------------------------------

/**
 * Append a single JSON line to the run's `events.jsonl` file.
 *
 * Creates the file if it does not already exist (the directory must already
 * exist, guaranteed by `createRunDir`).
 */
export async function appendEvent(
  runDir: string,
  event: Event,
): Promise<void> {
  const path = join(runDir, EVENTS_FILE);
  await appendFile(path, JSON.stringify(event) + "\n", "utf-8");
}

// ---------------------------------------------------------------------------
// readEvents
// ---------------------------------------------------------------------------

/**
 * Read all events from the run's `events.jsonl` file.
 *
 * Returns an empty array if the file does not exist.  Malformed lines are
 * silently skipped so a corrupt line does not prevent reading the rest.
 */
export async function readEvents(runDir: string): Promise<Event[]> {
  const path = join(runDir, EVENTS_FILE);
  if (!existsSync(path)) return [];

  const raw = await readFile(path, "utf-8");
  const events: Event[] = [];

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      events.push({
        type: String(parsed.type ?? ""),
        timestamp: String(parsed.timestamp ?? ""),
        data: (parsed.data != null && typeof parsed.data === "object")
          ? (parsed.data as Record<string, unknown>)
          : {},
      });
    } catch {
      // Skip malformed lines.
    }
  }

  return events;
}

// ---------------------------------------------------------------------------
// writeSession
// ---------------------------------------------------------------------------

/**
 * Write (overwrite) the run's `session.json` with the provided session data.
 *
 * The directory must already exist.  This is a full overwrite — callers
 * should read-then-merge if they need to preserve existing fields.
 */
export async function writeSession(
  runDir: string,
  session: Record<string, unknown>,
): Promise<void> {
  const path = join(runDir, SESSION_FILE);
  await writeFile(path, JSON.stringify(session) + "\n", "utf-8");
}

// ---------------------------------------------------------------------------
// readSession
// ---------------------------------------------------------------------------

/**
 * Read and parse the run's `session.json` file.
 *
 * Returns `null` if the file does not exist or is not valid JSON.
 */
export async function readSession(
  runDir: string,
): Promise<Record<string, unknown> | null> {
  const path = join(runDir, SESSION_FILE);
  if (!existsSync(path)) return null;

  try {
    const raw = await readFile(path, "utf-8");
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// sessionExists
// ---------------------------------------------------------------------------

/**
 * Check whether `session.json` exists in the given run directory.
 *
 * Synchronous — uses `existsSync` internally.  This is the one synchronous
 * function in this module, intended for fast path checks in hot loops and
 * synchronisation points.
 */
export function sessionExists(runDir: string): boolean {
  return existsSync(join(runDir, SESSION_FILE));
}
