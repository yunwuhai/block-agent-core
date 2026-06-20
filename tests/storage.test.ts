import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  appendEvent,
  appendSession,
  appendToolLog,
  createRunDir,
  generateRunId,
  listRunIds,
  readEvents,
  sessionExists,
} from "../storage/mod.ts";
import { buildTranscript } from "../storage/transcript-projector.ts";
import { writeHandoff } from "../storage/handoff-store.ts";
import type { EventEntry, ToolLogEntry } from "../storage/mod.ts";

const TMP = "/tmp/efficiency-subagent-test-" + randomUUID().slice(0, 8);

beforeEach(async () => {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(TMP, { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe("Storage event log", () => {
  it("creates a run directory under .pi/subagents/runs", async () => {
    const runId = generateRunId();
    const run = await createRunDir(TMP, runId);
    expect(run.dir).toContain(".pi/subagents/runs");
    expect(run.runId).toBe(runId);
    expect(existsSync(run.dir)).toBe(true);
  });

  it("appends and reads events", async () => {
    const runId = generateRunId();
    const run = await createRunDir(TMP, runId);
    const event: EventEntry = { timestamp: "2026-01-01T00:00:00Z", runId, event: "test", data: "hello" };
    await appendEvent(run, event);
    const events = await readEvents(run);
    expect(events).toHaveLength(1);
    expect(events[0]?.event).toBe("test");
  });

  it("appends session entries", async () => {
    const runId = generateRunId();
    const run = await createRunDir(TMP, runId);
    await appendSession(run, { timestamp: "now", runId, event: "message", role: "user" });
    expect(existsSync(run.sessionPath)).toBe(true);
  });

  it("appends tool log entries", async () => {
    const runId = generateRunId();
    const run = await createRunDir(TMP, runId);
    const entry: ToolLogEntry = { timestamp: "now", runId, event: "call", toolName: "read", toolCallId: "t1" };
    await appendToolLog(run, entry);
    expect(existsSync(run.toolsPath)).toBe(true);
  });

  it("checks session existence", async () => {
    const runId = generateRunId();
    await createRunDir(TMP, runId);
    expect(await sessionExists(TMP, runId)).toBe(true);
    expect(await sessionExists(TMP, "nonexistent")).toBe(false);
  });

  it("lists run ids", async () => {
    const r1 = generateRunId();
    const r2 = generateRunId();
    await createRunDir(TMP, r1);
    await createRunDir(TMP, r2);
    const ids = await listRunIds(TMP);
    expect(ids).toHaveLength(2);
    expect(ids).toContain(r1);
    expect(ids).toContain(r2);
  });

  it("writeHandoff creates a handoff.md file", async () => {
    const runId = generateRunId();
    const run = await createRunDir(TMP, runId);
    const path = await writeHandoff(run, { runId, profile: "test", status: "completed", summary: "ok", artifacts: ["a.md"] });
    expect(path).toBe(join(run.dir, "handoff.md"));
    expect(existsSync(path)).toBe(true);
  });

  it("buildTranscript generates markdown from events", async () => {
    const runId = generateRunId();
    const run = await createRunDir(TMP, runId);
    await appendEvent(run, { timestamp: "T1", runId, event: "run_start", profile: "test", task: "do" });
    await appendEvent(run, { timestamp: "T2", runId, event: "run_end", status: "completed", exitCode: 0 });
    const { markdown } = await buildTranscript(run);
    expect(markdown).toContain("Run Started");
    expect(markdown).toContain("Run completed");
  });
});
