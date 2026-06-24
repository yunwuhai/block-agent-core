import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  appendEvent,
  readEvents,
  writeSession,
  readSession,
  sessionExists,
  createRunDir,
  listRunIds,
  cleanupRuns,
} from "./mod.ts";
import type { Event } from "./mod.ts";

const TMP = "/tmp/efficiency-subagent-test-" + randomUUID().slice(0, 8);

beforeEach(async () => {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(TMP, { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe("event-log", () => {
  it("creates a run directory under .pi/better-subagent/runs", async () => {
    const runId = "test-run-001";
    const run = await createRunDir(TMP, runId);
    expect(run.dir).toContain(".pi/better-subagent/runs");
    expect(existsSync(run.dir)).toBe(true);
    expect(existsSync(run.sessionPath)).toBe(true);
  });

  it("createRunDir returns a RunDirectory with all paths", async () => {
    const runId = "test-paths";
    const run = await createRunDir(TMP, runId);
    expect(run.dir).toBeString();
    expect(run.eventsPath).toBe(join(run.dir, "events.jsonl"));
    expect(run.sessionPath).toBe(join(run.dir, "session.json"));
    expect(run.handoffPath).toBe(join(run.dir, "handoff.md"));
    expect(run.transcriptPath).toBe(join(run.dir, "transcript.md"));
  });

  it("writeSession and readSession persist session data", async () => {
    const run = await createRunDir(TMP, "test-session");
    const sessionData = { runId: "test-session", profile: "dev", status: "running", startedAt: "2026-01-01T00:00:00Z" };
    await writeSession(run.dir, sessionData);
    const loaded = await readSession(run.dir);
    expect(loaded).toBeDefined();
    expect(loaded!.runId).toBe("test-session");
    expect(loaded!.profile).toBe("dev");
  });

  it("readSession returns null for missing directory", async () => {
    const result = await readSession("/tmp/nonexistent-run-dir-xyz");
    expect(result).toBeNull();
  });

  it("sessionExists returns true when session.json exists", async () => {
    const run = await createRunDir(TMP, "test-exists");
    expect(sessionExists(run.dir)).toBe(true);
  });

  it("sessionExists returns false when session.json does not exist", async () => {
    expect(sessionExists("/tmp/nonexistent-run-dir-xyz")).toBe(false);
  });

  it("appends and reads events", async () => {
    const run = await createRunDir(TMP, "test-events");
    const event: Event = {
      type: "run_start",
      timestamp: "2026-01-01T00:00:00Z",
      data: { profile: "dev", task: "test task", runId: "test-events" },
    };
    await appendEvent(run.dir, event);
    const events = await readEvents(run.dir);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("run_start");
    expect(events[0]!.data.profile).toBe("dev");
  });

  it("readEvents returns empty array if events.jsonl missing", async () => {
    const events = await readEvents("/tmp/nonexistent-run-dir-xyz");
    expect(events).toHaveLength(0);
  });

  it("readEvents skips malformed lines", async () => {
    const run = await createRunDir(TMP, "test-malformed");
    const { appendFile } = await import("node:fs/promises");
    // Write a mix of valid and invalid JSON lines
    await appendFile(run.eventsPath, '{"type":"good","timestamp":"T","data":{}}\nnot-json\n{"type":"also-good","timestamp":"T","data":{}}\n', "utf-8");
    const events = await readEvents(run.dir);
    expect(events).toHaveLength(2);
    expect(events[0]!.type).toBe("good");
    expect(events[1]!.type).toBe("also-good");
  });

  it("handles multiple events", async () => {
    const run = await createRunDir(TMP, "test-multi");
    await appendEvent(run.dir, { type: "run_start", timestamp: "T1", data: { runId: "test-multi" } });
    await appendEvent(run.dir, { type: "tool_call", timestamp: "T2", data: { tool: "read", args: { path: "a.txt" } } });
    await appendEvent(run.dir, { type: "tool_result", timestamp: "T3", data: { tool: "read", status: "ok", output: "content" } });
    await appendEvent(run.dir, { type: "run_end", timestamp: "T4", data: { status: "completed" } });
    const events = await readEvents(run.dir);
    expect(events).toHaveLength(4);
    expect(events[0]!.type).toBe("run_start");
    expect(events[1]!.type).toBe("tool_call");
    expect(events[2]!.type).toBe("tool_result");
    expect(events[3]!.type).toBe("run_end");
  });
});

describe("run-artifacts", () => {
  it("listRunIds returns empty array when no runs exist", async () => {
    const ids = await listRunIds("/tmp/nonexistent-dir-abc");
    expect(ids).toHaveLength(0);
  });

  it("listRunIds returns all run IDs without filter", async () => {
    await createRunDir(TMP, "run-a");
    await createRunDir(TMP, "run-b");
    const ids = await listRunIds(TMP);
    expect(ids).toHaveLength(2);
    expect(ids).toContain("run-a");
    expect(ids).toContain("run-b");
  });

  it("listRunIds filters by profile", async () => {
    const runA = await createRunDir(TMP, "run-profile-a");
    const runB = await createRunDir(TMP, "run-profile-b");
    await writeSession(runA.dir, { runId: "run-profile-a", profile: "dev", status: "running" });
    await writeSession(runB.dir, { runId: "run-profile-b", profile: "prod", status: "running" });

    const devRuns = await listRunIds(TMP, { profile: "dev" });
    expect(devRuns).toHaveLength(1);
    expect(devRuns[0]).toBe("run-profile-a");
  });

  it("listRunIds filters by status", async () => {
    const runA = await createRunDir(TMP, "run-status-a");
    const runB = await createRunDir(TMP, "run-status-b");
    await writeSession(runA.dir, { runId: "run-status-a", profile: "dev", status: "completed" });
    await writeSession(runB.dir, { runId: "run-status-b", profile: "dev", status: "running" });

    const active = await listRunIds(TMP, { status: "running" });
    expect(active).toHaveLength(1);
    expect(active[0]).toBe("run-status-b");
  });

  it("cleanupRuns removes oldest runs beyond maxRuns", async () => {
    // Create runs with explicit startedAt times
    const run1 = await createRunDir(TMP, "oldest");
    await writeSession(run1.dir, { runId: "oldest", startedAt: "2024-01-01T00:00:00Z", status: "completed" });

    const run2 = await createRunDir(TMP, "middle");
    await writeSession(run2.dir, { runId: "middle", startedAt: "2025-01-01T00:00:00Z", status: "completed" });

    const run3 = await createRunDir(TMP, "newest");
    await writeSession(run3.dir, { runId: "newest", startedAt: "2026-01-01T00:00:00Z", status: "completed" });

    const deleted = await cleanupRuns(TMP, 2);
    expect(deleted).toBe(1);
    expect(existsSync(run1.dir)).toBe(false); // oldest removed
    expect(existsSync(run2.dir)).toBe(true);
    expect(existsSync(run3.dir)).toBe(true);
  });

  it("cleanupRuns returns 0 when under maxRuns", async () => {
    await createRunDir(TMP, "only-one");
    const deleted = await cleanupRuns(TMP, 10);
    expect(deleted).toBe(0);
  });

  it("cleanupRuns returns 0 when runs dir missing", async () => {
    const deleted = await cleanupRuns("/tmp/nonexistent-dir-abc", 1);
    expect(deleted).toBe(0);
  });
});
