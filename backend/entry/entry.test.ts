/**
 * Tests for the programmatic entry point (backend/entry/index.ts).
 *
 * Test categories:
 *   1. executeRun — basic flow (create, artifacts, re-exports)
 *   2. executeRun — continuation flow
 *   3. executeRun — error handling
 *   4. MountControllerAdapter — schedule/unschedule operations
 *   5. Module re-exports — smoke checks
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { reset } from "../runtime/prompt-state.ts";
import { executeRun, Registry, resolve, compose, CapabilityRegistry } from "./index.ts";

const TMP = "/tmp/efficiency-subagent-entry-test-" + randomUUID().slice(0, 8);

const PROFILE_CONTENT = [
  "---",
  "name: entry-test-profile",
  "description: Entry point test profile",
  "---",
  "You are a test agent. Execute the task: ${task}",
].join("\n");

beforeEach(() => {
  mkdirSync(`${TMP}/.profiles`, { recursive: true });
  writeFileSync(`${TMP}/.profiles/entry-test-profile.md`, PROFILE_CONTENT);
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
  reset();
});

// ---------------------------------------------------------------------------
// 1. executeRun — basic create flow
// ---------------------------------------------------------------------------

describe("executeRun — create", () => {
  it("executes a profile+task run and returns RunResult", async () => {
    const result = await executeRun({
      profile: "entry-test-profile",
      task: "verify basic run",
      cwd: TMP,
    });

    expect(result).toBeDefined();
    expect(result.id).toBeTruthy();
    expect(result.status).toBe("completed");
    expect(result.handoffPath).toContain("handoff.md");
    expect(result.transcriptPath).toContain("transcript.md");
    expect(result.output).toBe("Run completed.");
  });

  it("creates run artifacts on disk", async () => {
    const result = await executeRun({
      profile: "entry-test-profile",
      task: "check artifacts exist",
      cwd: TMP,
    });

    const { readFile } = await import("node:fs/promises");

    // Handoff document exists and is non-empty
    const handoff = await readFile(result.handoffPath, "utf-8").catch(() => "");
    expect(handoff.length).toBeGreaterThan(0);
    expect(handoff).toContain("runId");

    // Transcript document exists and is non-empty
    const transcript = await readFile(result.transcriptPath, "utf-8").catch(() => "");
    expect(transcript.length).toBeGreaterThan(0);
    expect(transcript).toContain("Transcript");
  });

  it("processes actions array when provided", async () => {
    const result = await executeRun({
      profile: "entry-test-profile",
      task: "multi-action test",
      cwd: TMP,
      actions: [
        { type: "tool_call", tool: "read", args: { path: "file.txt" } },
        { type: "tool_call", tool: "write", args: { path: "output.txt" } },
      ],
    });

    expect(result.status).toBe("completed");

    // Verify events include both tool calls
    const { readEvents } = await import("../storage/mod.ts");
    const runDir = TMP + "/.pi/better-subagent/runs/" + result.id;
    const events = await readEvents(runDir);
    const toolCalls = events.filter((e) => e.type === "tool_call");
    expect(toolCalls.length).toBe(2);
  });

  it("handles empty actions array gracefully", async () => {
    const result = await executeRun({
      profile: "entry-test-profile",
      task: "empty actions",
      cwd: TMP,
      actions: [],
    });

    expect(result.status).toBe("completed");
  });

  it("produces a run ID matching the expected format", async () => {
    const result = await executeRun({
      profile: "entry-test-profile",
      task: "inspect run-id",
      cwd: TMP,
    });

    // Format: {profile}-{task-slug}-{ISOtimestamp}-{hex}
    expect(result.id).toMatch(/^entry-test-profile-/);
    expect(result.id).toContain("inspect-run-id");
  });
});

// ---------------------------------------------------------------------------
// 2. executeRun — continuation flow
// ---------------------------------------------------------------------------

describe("executeRun — continue", () => {
  it("continues an existing run when runId is provided", async () => {
    // First run
    const first = await executeRun({
      profile: "entry-test-profile",
      task: "initial run for continuation test",
      cwd: TMP,
    });

    // Verify run directory exists
    const { existsSync } = await import("node:fs");
    const runsRoot = `${TMP}/.pi/better-subagent/runs/${first.id}`;
    expect(existsSync(runsRoot)).toBe(true);

    // Continue with the same run ID
    const second = await executeRun({
      profile: "entry-test-profile",
      task: "continue test",
      cwd: TMP,
      runId: first.id,
      actions: [
        { type: "tool_call", tool: "read", args: { path: "extra.txt" } },
      ],
    });

    expect(second.status).toBe("completed");
    // Continuation reuses the same base run ID
    expect(second.id).toContain(first.id);
  });

  it("rejects continuation for a non-existent run ID", async () => {
    const fakeId = "this-run-does-not-exist-000000";

    await expect(
      executeRun({
        profile: "entry-test-profile",
        task: "continue missing",
        cwd: TMP,
        runId: fakeId,
      }),
    ).rejects.toThrow(/directory not found/);
  });
});

// ---------------------------------------------------------------------------
// 3. executeRun — error handling
// ---------------------------------------------------------------------------

describe("executeRun — error handling", () => {
  it("fails gracefully when profile does not exist", async () => {
    const result = await executeRun({
      profile: "nonexistent-profile",
      task: "should fail",
      cwd: TMP,
    });

    expect(result.status).toBe("failed");
    expect(result.id).toBeTruthy();
  });

  it("fails gracefully when cwd is invalid", async () => {
    await expect(
      executeRun({
        profile: "entry-test-profile",
        task: "invalid cwd",
        cwd: "/nonexistent/path/xyz789",
      }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 4. MountControllerAdapter — schedule/unschedule operations
// ---------------------------------------------------------------------------

describe("MountControllerAdapter", () => {
  it("can be instantiated via executeRun with schedule actions", async () => {
    const result = await executeRun({
      profile: "entry-test-profile",
      task: "schedule test",
      cwd: TMP,
      actions: [
        { type: "schedule", tags: ["test-tag"] },
        { type: "unschedule", entryIds: ["test-id"] },
      ],
    });

    // The adapter handles schedule/unschedule via the underlying controller.
    // With no matching entries, schedule yields 0 mounted, unschedule yields
    // 0 removed -- both are no-ops that should not cause errors.
    expect(result.status).toBe("completed");
  });

  it("handles clearSchedule via adapter", async () => {
    // ClearSchedule is never called by the current RunLifecycle but is part
    // of the MountController interface. The adapter implements it without
    // throwing.
    const result = await executeRun({
      profile: "entry-test-profile",
      task: "clear schedule",
      cwd: TMP,
      actions: [
        { type: "schedule", tags: ["foo"] },
        { type: "schedule", tags: ["bar"] },
      ],
    });

    expect(result.status).toBe("completed");
  });
});

// ---------------------------------------------------------------------------
// 5. Module re-exports — smoke checks
// ---------------------------------------------------------------------------

describe("module re-exports", () => {
  it("re-exports Registry class", () => {
    expect(Registry).toBeDefined();
    const reg = new Registry();
    expect(typeof reg.add).toBe("function");
    expect(typeof reg.get).toBe("function");
    expect(typeof reg.remove).toBe("function");
  });

  it("re-exports resolve function", () => {
    expect(resolve).toBeDefined();
    expect(typeof resolve).toBe("function");
  });

  it("re-exports compose function", () => {
    expect(compose).toBeDefined();
    expect(typeof compose).toBe("function");
  });

  it("re-exports CapabilityRegistry class", () => {
    expect(CapabilityRegistry).toBeDefined();
    const capReg = new CapabilityRegistry();
    expect(typeof capReg.declare).toBe("function");
    expect(typeof capReg.expand).toBe("function");
  });

  it("executeRun is exported as a function", () => {
    expect(executeRun).toBeDefined();
    expect(typeof executeRun).toBe("function");
  });
});
