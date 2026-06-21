import { appendFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

export interface EventEntry {
  readonly timestamp: string;
  readonly runId: string;
  readonly event: string;
  readonly [key: string]: unknown;
}

export interface ToolLogEntry {
  readonly timestamp: string;
  readonly runId: string;
  readonly event: "call" | "result";
  readonly toolName: string;
  readonly toolCallId: string;
  readonly arguments?: Record<string, unknown>;
  readonly output?: string;
  readonly isError?: boolean;
}

export interface SessionState {
  readonly runId: string;
  readonly startedAt: string;
  readonly status: string;
  readonly profile?: string;
  readonly task?: string;
}

export interface RunDirectory {
  readonly runId: string;
  readonly dir: string;
  readonly sessionPath: string;
  readonly sessionStatePath: string;
  readonly eventsPath: string;
  readonly toolsPath: string;
  readonly handoffPath: string;
}

const RUNS_ROOT = ".pi/subagents/runs";

export function resolveRunsRoot(cwd: string): string {
  return resolve(cwd, RUNS_ROOT);
}

export function generateRunId(): string {
  return randomUUID().slice(0, 12);
}

export function generateRunDirName(profile: string, task: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const safeProfile = profile.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 20);
  const safeTask = task.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30);
  const shortId = randomUUID().slice(0, 6);
  return `${safeProfile}-${safeTask}-${timestamp}-${shortId}`;
}

export async function createRunDir(
  cwd: string,
  runId?: string,
  profile?: string,
  task?: string,
): Promise<RunDirectory> {
  const root = resolveRunsRoot(cwd);
  const resolvedRunId = runId
    ?? (profile && task ? generateRunDirName(profile, task) : generateRunId());
  const dir = join(root, resolvedRunId);
  const sessionStatePath = join(dir, "session.json");

  // Session continuation: if directory already exists, return existing run
  if (existsSync(dir)) {
    console.log(
      `[event-log] Session ${resolvedRunId} directory already exists, reusing...`,
    );
    return {
      runId: resolvedRunId,
      dir,
      sessionPath: join(dir, "session.jsonl"),
      sessionStatePath,
      eventsPath: join(dir, "events.jsonl"),
      toolsPath: join(dir, "tools.jsonl"),
      handoffPath: join(dir, "handoff.md"),
    };
  }

  // Fresh creation
  await mkdir(dir, { recursive: true });

  const sessionState: SessionState = {
    runId: resolvedRunId,
    startedAt: new Date().toISOString(),
    status: "running",
  };
  await writeFile(
    sessionStatePath,
    JSON.stringify(sessionState) + "\n",
    "utf-8",
  );

  return {
    runId: resolvedRunId,
    dir,
    sessionPath: join(dir, "session.jsonl"),
    sessionStatePath,
    eventsPath: join(dir, "events.jsonl"),
    toolsPath: join(dir, "tools.jsonl"),
    handoffPath: join(dir, "handoff.md"),
  };
}

export async function writeSessionState(
  run: RunDirectory,
  status: string,
): Promise<void> {
  const state: SessionState = {
    runId: run.runId,
    startedAt: await readSessionStartedAt(run).catch(() =>
      new Date().toISOString()
    ),
    status,
  };
  await writeFile(run.sessionStatePath, JSON.stringify(state) + "\n", "utf-8");
}

async function readSessionStartedAt(run: RunDirectory): Promise<string> {
  if (!existsSync(run.sessionStatePath)) {
    return new Date().toISOString();
  }
  const raw = await readFile(run.sessionStatePath, "utf-8");
  const state: SessionState = JSON.parse(raw);
  return state.startedAt;
}

export async function readSessionState(
  run: RunDirectory,
): Promise<SessionState | null> {
  if (!existsSync(run.sessionStatePath)) return null;
  const raw = await readFile(run.sessionStatePath, "utf-8");
  return JSON.parse(raw) as SessionState;
}

export async function appendEvent(
  run: RunDirectory,
  entry: EventEntry,
): Promise<void> {
  await appendFile(run.eventsPath, JSON.stringify(entry) + "\n", "utf-8");
}

export async function appendSession(
  run: RunDirectory,
  entry: EventEntry,
): Promise<void> {
  await appendFile(run.sessionPath, JSON.stringify(entry) + "\n", "utf-8");
}

export async function appendToolLog(
  run: RunDirectory,
  entry: ToolLogEntry,
): Promise<void> {
  await appendFile(run.toolsPath, JSON.stringify(entry) + "\n", "utf-8");
}

export async function readEvents(run: RunDirectory): Promise<EventEntry[]> {
  if (!existsSync(run.eventsPath)) return [];
  const raw = await readFile(run.eventsPath, "utf-8");
  return raw
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line: string) => JSON.parse(line) as EventEntry);
}

export async function readRunProfile(
  cwd: string,
  runId: string,
): Promise<string | null> {
  const root = resolveRunsRoot(cwd);
  const statePath = join(root, runId, "session.json");
  if (!existsSync(statePath)) return null;
  try {
    const raw = await readFile(statePath, "utf-8");
    const state: SessionState = JSON.parse(raw);
    return state.profile ?? null;
  } catch {
    return null;
  }
}

export async function sessionExists(
  cwd: string,
  runId: string,
): Promise<boolean> {
  return existsSync(join(resolveRunsRoot(cwd), runId));
}

export async function listRunIds(cwd: string): Promise<string[]> {
  const root = resolveRunsRoot(cwd);
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

async function inferStatusFromEvents(runDir: string): Promise<string | null> {
  const eventsPath = join(runDir, "events.jsonl");
  if (!existsSync(eventsPath)) return null;
  const raw = await readFile(eventsPath, "utf-8");
  const lines = raw.trim().split("\n").filter(Boolean);
  const lastLines = lines.slice(-5);
  for (let i = lastLines.length - 1; i >= 0; i--) {
    try {
      const event = JSON.parse(lastLines[i]!) as EventEntry;
      if (event.event === "run_end") {
        return (event.status as string) ?? null;
      }
    } catch { continue; }
  }
  return null;
}

export async function formatRunList(cwd: string): Promise<string> {
  const root = resolveRunsRoot(cwd);
  if (!existsSync(root)) return "No runs found.";

  const entries = await readdir(root, { withFileTypes: true });
  const runDirs = entries.filter((e) => e.isDirectory());

  if (runDirs.length === 0) return "No runs found.";

  const lines: string[] = [""];
  for (const entry of runDirs) {
    const runId = entry.name;
    const statePath = join(root, runId, "session.json");
    let startedAt = "unknown";
    let status = "unknown";
    if (existsSync(statePath)) {
      try {
        const raw = await readFile(statePath, "utf-8");
        const state: SessionState = JSON.parse(raw);
        startedAt = state.startedAt;
        status = state.status;
      } catch {
        // ignore corrupt state files
      }
    }
    // Cross-check running status against events.jsonl
    if (status === "running") {
      const inferred = await inferStatusFromEvents(join(root, runId));
      if (inferred === "completed") status = "completed";
      else if (inferred === "failed") status = "failed";
      else if (inferred === "blocked") status = "blocked";
    }
    const icon = status === "running" ? "●" : status === "completed" ? "✓" : "✗";
    lines.push(`  ${icon} ${runId}  ${startedAt}  ${status}`);
  }
  return lines.join("\n");
}

export interface RunSearchQuery {
  eventType?: string;
  toolName?: string;
  since?: string;
  until?: string;
  profile?: string;
  status?: string;
}

export async function searchRuns(
  cwd: string,
  query: RunSearchQuery,
): Promise<EventEntry[]> {
  const root = resolveRunsRoot(cwd);
  if (!existsSync(root)) return [];

  const entries = await readdir(root, { withFileTypes: true });
  const runDirs = entries.filter((e) => e.isDirectory());

  const results: EventEntry[] = [];

  for (const entry of runDirs) {
    const runDir = join(root, entry.name);

    // Profile/status filters: check session.json
    if (query.profile || query.status) {
      const statePath = join(runDir, "session.json");
      if (existsSync(statePath)) {
        try {
          const raw = await readFile(statePath, "utf-8");
          const state: SessionState = JSON.parse(raw);
          if (query.profile && state.profile !== query.profile) continue;
          if (query.status && state.status !== query.status) continue;
        } catch {
          continue;
        }
      } else {
        continue;
      }
    }

    const eventsPath = join(runDir, "events.jsonl");
    if (!existsSync(eventsPath)) continue;

    const raw = await readFile(eventsPath, "utf-8");
    const events: EventEntry[] = raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line: string) => JSON.parse(line) as EventEntry);

    for (const event of events) {
      if (query.eventType && event.event !== query.eventType) continue;
      if (
        query.toolName &&
        event.toolName !== query.toolName
      ) continue;
      if (query.since && event.timestamp < query.since) continue;
      if (query.until && event.timestamp >= query.until) continue;
      results.push(event);
    }
  }

  return results;
}

export interface CleanupPolicy {
  maxRuns?: number;
  maxAgeMs?: number;
  keepStatuses?: string[];
}

export async function cleanupRuns(
  cwd: string,
  policy: CleanupPolicy,
): Promise<number> {
  const root = resolveRunsRoot(cwd);
  if (!existsSync(root)) return 0;

  const entries = await readdir(root, { withFileTypes: true });
  const runDirs = entries.filter((e) => e.isDirectory());

  const runs: Array<{ name: string; startedAt: number; status: string }> = [];
  for (const entry of runDirs) {
    const statePath = join(root, entry.name, "session.json");
    let startedAt = 0;
    let status = "unknown";
    if (existsSync(statePath)) {
      try {
        const raw = await readFile(statePath, "utf-8");
        const state = JSON.parse(raw);
        startedAt = new Date(state.startedAt).getTime();
        status = state.status;
      } catch { continue; }
    }
    runs.push({ name: entry.name, startedAt, status });
  }

  runs.sort((a, b) => a.startedAt - b.startedAt);

  let removed = 0;
  const now = Date.now();

  for (const run of runs) {
    let shouldRemove = false;

    if (policy.maxAgeMs && (now - run.startedAt) > policy.maxAgeMs) {
      shouldRemove = true;
    }

    if (policy.keepStatuses?.includes(run.status)) {
      shouldRemove = false;
    }

    if (shouldRemove) {
      await rm(join(root, run.name), { recursive: true, force: true });
      removed++;
    }
  }

  if (policy.maxRuns && policy.maxRuns > 0) {
    const remaining = runs.filter((r) => existsSync(join(root, r.name)));
    if (remaining.length > policy.maxRuns) {
      const toRemove = remaining.slice(0, remaining.length - policy.maxRuns);
      for (const run of toRemove) {
        if (!policy.keepStatuses?.includes(run.status)) {
          await rm(join(root, run.name), { recursive: true, force: true });
          removed++;
        }
      }
    }
  }

  return removed;
}
