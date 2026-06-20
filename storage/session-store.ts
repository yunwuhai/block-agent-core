import type { EventEntry, ToolLogEntry } from "./event-log.ts";
import { createRunDir, generateRunId } from "./event-log.ts";

export interface RunSession {
  readonly runId: string;
  readonly startedAt: string;
  status: "running" | "completed" | "failed";
}

const activeSessions = new Map<string, RunSession>();

export function startSession(runId: string): RunSession {
  const session: RunSession = { runId, startedAt: isoNow(), status: "running" };
  activeSessions.set(runId, session);
  return session;
}

export function getSession(runId: string): RunSession | undefined {
  return activeSessions.get(runId);
}

export function finishSession(runId: string, failed: boolean): void {
  const session = activeSessions.get(runId);
  if (session) {
    session.status = failed ? "failed" : "completed";
  }
}

export { createRunDir, generateRunId };
export type { EventEntry, ToolLogEntry };

function isoNow(): string {
  return new Date().toISOString();
}
