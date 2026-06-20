import { appendFile, mkdir, readdir, readFile } from "node:fs/promises";
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

export interface RunDirectory {
  readonly runId: string;
  readonly dir: string;
  readonly sessionPath: string;
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

export async function createRunDir(cwd: string, runId: string): Promise<RunDirectory> {
  const root = resolveRunsRoot(cwd);
  const dir = join(root, runId);
  await mkdir(dir, { recursive: true });
  return {
    runId,
    dir,
    sessionPath: join(dir, "session.jsonl"),
    eventsPath: join(dir, "events.jsonl"),
    toolsPath: join(dir, "tools.jsonl"),
    handoffPath: join(dir, "handoff.md"),
  };
}

export async function appendEvent(run: RunDirectory, entry: EventEntry): Promise<void> {
  await appendFile(run.eventsPath, JSON.stringify(entry) + "\n", "utf-8");
}

export async function appendSession(run: RunDirectory, entry: EventEntry): Promise<void> {
  await appendFile(run.sessionPath, JSON.stringify(entry) + "\n", "utf-8");
}

export async function appendToolLog(run: RunDirectory, entry: ToolLogEntry): Promise<void> {
  await appendFile(run.toolsPath, JSON.stringify(entry) + "\n", "utf-8");
}

export async function readEvents(run: RunDirectory): Promise<EventEntry[]> {
  if (!existsSync(run.eventsPath)) return [];
  const raw = await readFile(run.eventsPath, "utf-8");
  return raw.trim().split("\n").filter(Boolean).map((line: string) => JSON.parse(line) as EventEntry);
}

export async function sessionExists(cwd: string, runId: string): Promise<boolean> {
  return existsSync(join(resolveRunsRoot(cwd), runId));
}

export async function listRunIds(cwd: string): Promise<string[]> {
  const root = resolveRunsRoot(cwd);
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}
