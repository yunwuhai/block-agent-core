/**
 * storage/run-artifacts.ts — Run directory lifecycle and artifact generation.
 *
 * =============================================================================
 *  Manages the on-disk layout of each run's artifact directory and produces
 *  the handoff document and transcript for a completed run.
 *
 *  Directory layout (under `baseDir/.pi/better-subagent/runs/{runId}/`):
 *
 *    events.jsonl       — Structured event log (JSONL, one Event per line)
 *    session.json       — Session metadata (JSON, overwritten on state changes)
 *    handoff.md         — Handoff document (markdown)
 *    transcript.md      — Run transcript (markdown)
 *
 *  The pure markdown formatting is delegated to runtime/output.ts.
 *  This module provides the I/O wrapper and path management.
 * =============================================================================
 */

import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { buildHandoff as formatHandoff, buildTranscript as formatTranscript } from "../runtime/output.ts";
import type { Run } from "../runtime/run.ts";
import type { ContextAssembly } from "../core/types.ts";
import type { Event } from "./event-log.ts";
import { writeSession, readSession } from "./event-log.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RUNS_ROOT = ".pi/better-subagent/runs";

// ---------------------------------------------------------------------------
// RunDirectory
// ---------------------------------------------------------------------------

/**
 * Path references to all files within a single run's artifact directory.
 *
 * All paths are absolute.
 */
export interface RunDirectory {
  /** Absolute path to the run's artifact directory. */
  readonly dir: string;
  /** Path to `events.jsonl`. */
  readonly eventsPath: string;
  /** Path to `session.json`. */
  readonly sessionPath: string;
  /** Path to `handoff.md`. */
  readonly handoffPath: string;
  /** Path to `transcript.md`. */
  readonly transcriptPath: string;
}

// ---------------------------------------------------------------------------
// resolveRunsRoot
// ---------------------------------------------------------------------------

/**
 * Resolve the absolute path to the runs root directory.
 *
 * @param baseDir — Project root or workspace directory.
 * @returns Absolute path to `.pi/better-subagent/runs/`.
 */
export function resolveRunsRoot(baseDir: string): string {
  return resolve(baseDir, RUNS_ROOT);
}

// ---------------------------------------------------------------------------
// createRunDir
// ---------------------------------------------------------------------------

/**
 * Create a new run artifact directory under `baseDir/.pi/better-subagent/runs/`.
 *
 * Creates the directory structure and initialises `session.json` with the
 * run ID and start time.  If the directory already exists (continuation), it
 * is reused as-is.
 *
 * @param baseDir — Project root or workspace directory.
 * @param runId   — Unique run identifier.
 * @returns A `RunDirectory` with absolute paths to all artifact files.
 */
export async function createRunDir(
  baseDir: string,
  runId: string,
): Promise<RunDirectory> {
  const dir = resolve(resolveRunsRoot(baseDir), runId);
  const eventsPath = join(dir, "events.jsonl");
  const sessionPath = join(dir, "session.json");
  const handoffPath = join(dir, "handoff.md");
  const transcriptPath = join(dir, "transcript.md");

  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
    // Initialise session.json with start time.
    await writeSession(dir, {
      runId,
      startedAt: new Date().toISOString(),
      status: "created",
    });
  }

  return { dir, eventsPath, sessionPath, handoffPath, transcriptPath };
}

// ---------------------------------------------------------------------------
// buildHandoff
// ---------------------------------------------------------------------------

/**
 * Build the handoff document for a completed run and write it to
 * `<runDir>/handoff.md`.
 *
 * Delegates markdown formatting to `runtime/output.ts`'s `buildHandoff`,
 * which produces a YAML-frontmatter document with context assembly summary,
 * mounted/excluded entry tables, files touched, tool call summary, and
 * next-steps guidance.
 *
 * When `assembly` is omitted, an empty assembly is used (the context
 * assembly sections of the handoff will show zero entries).
 *
 * @param run      — Run metadata (id, profile, task, status, startTime, etc.).
 * @param events   — Ordered event log for the run.
 * @param assembly — Optional context assembly produced by the pipeline.
 * @returns The formatted handoff markdown string (also written to disk).
 */
export async function buildHandoff(
  run: Run,
  events: Event[],
  assembly?: ContextAssembly,
): Promise<string> {
  const emptyAssembly: ContextAssembly = {
    mounted: [],
    excluded: [],
    pool: [],
    metrics: {
      totalTokens: 0,
      budgetUsedPercent: 0,
      mountedCount: 0,
      excludedCount: 0,
      poolCount: 0,
    },
  };
  const markdown = formatHandoff(run, events, assembly ?? emptyAssembly);
  const handoffPath = join(run.directory, "handoff.md");
  await writeFile(handoffPath, markdown, "utf-8");
  return markdown;
}

// ---------------------------------------------------------------------------
// buildTranscript
// ---------------------------------------------------------------------------

/**
 * Build the transcript document for a run and write it to
 * `<runDir>/transcript.md`.
 *
 * Delegates markdown formatting to `runtime/output.ts`'s `buildTranscript`,
 * which produces a chronological event log with timestamps, tool calls, and
 * context mount/unmount notifications.
 *
 * @param run    — Run metadata (id, profile, task, startTime, status).
 * @param events — Ordered event log for the run.
 * @returns The formatted transcript markdown string (also written to disk).
 */
export async function buildTranscript(
  run: Run,
  events: Event[],
): Promise<string> {
  const markdown = formatTranscript(run, events);
  const transcriptPath = join(run.directory, "transcript.md");
  await writeFile(transcriptPath, markdown, "utf-8");
  return markdown;
}

// ---------------------------------------------------------------------------
// listRunIds
// ---------------------------------------------------------------------------

/**
 * List run IDs in the runs directory, optionally filtered by profile or
 * status as stored in each run's `session.json`.
 *
 * Returns only directory names that have a valid `session.json` matching
 * the filter criteria.  Directories without a parseable `session.json`
 * are silently excluded.
 *
 * @param baseDir — Project root or workspace directory.
 * @param filter  — Optional filter criteria.
 * @returns An array of run ID strings, sorted by start time (newest first).
 */
export async function listRunIds(
  baseDir: string,
  filter?: { profile?: string; status?: string },
): Promise<string[]> {
  const root = resolveRunsRoot(baseDir);
  if (!existsSync(root)) return [];

  const entries = await readdir(root, { withFileTypes: true });
  const runDirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  if (!filter) {
    return runDirs.sort().reverse();
  }

  // Filter by session.json content.
  const matched: string[] = [];
  for (const runId of runDirs) {
    const session = await readSession(join(root, runId));
    if (!session) continue;

    if (filter.profile && session.profile !== filter.profile) continue;
    if (filter.status && session.status !== filter.status) continue;

    matched.push(runId);
  }

  return matched.sort().reverse();
}

// ---------------------------------------------------------------------------
// cleanupRuns
// ---------------------------------------------------------------------------

/**
 * Remove the oldest completed and failed runs beyond `maxRuns`.
 *
 * Sorting is by `session.json`'s `startedAt` timestamp.  Runs without a
 * valid `session.json` are treated as oldest (moved to front of the removal
 * queue).  At most `maxRuns` are retained; the rest are deleted.
 *
 * @param baseDir — Project root or workspace directory.
 * @param maxRuns — Maximum number of run directories to retain.
 * @returns The number of run directories deleted.
 */
export async function cleanupRuns(
  baseDir: string,
  maxRuns: number,
): Promise<number> {
  const root = resolveRunsRoot(baseDir);
  if (!existsSync(root)) return 0;

  const entries = await readdir(root, { withFileTypes: true });
  const runDirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  if (runDirs.length <= maxRuns) return 0;

  // Sort by startedAt ascending (oldest first).
  const withTime: Array<{ runId: string; startedAt: number }> = [];
  for (const runId of runDirs) {
    const session = await readSession(join(root, runId));
    const startedAt = session?.startedAt
      ? new Date(String(session.startedAt)).getTime()
      : 0;
    withTime.push({ runId, startedAt });
  }
  withTime.sort((a, b) => a.startedAt - b.startedAt);

  // Remove the oldest runs beyond maxRuns.
  const toRemove = withTime.slice(0, withTime.length - maxRuns);
  let removed = 0;
  for (const { runId } of toRemove) {
    await rm(join(root, runId), { recursive: true, force: true });
    removed++;
  }

  return removed;
}
