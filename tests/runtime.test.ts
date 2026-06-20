import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { executeRun } from "../runtime/mod.ts";
import { reset } from "../runtime/prompt-slots/engine.ts";

const TMP = "/tmp/efficiency-subagent-test-" + randomUUID().slice(0, 8);

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
  reset();
});

describe("Runtime runner", () => {
  it("executes a profile+task run and creates artifacts", async () => {
    const result = await executeRun({
      cwd: TMP,
      params: { profile: "test-profile", task: "verify smoke test" },
      projectPolicy: null,
      mergedPolicy: null,
    });

    expect(result.status).toBe("completed");
    expect(result.runId).toBeTruthy();
    expect(result.handoffPath).toContain("handoff.md");
    expect(result.events.length).toBeGreaterThan(0);

    const runStartEvents = result.events.filter((e) => e.type === "run_start");
    expect(runStartEvents.length).toBe(1);
  });

  it("blocks a tool call when policy denies it", async () => {
    const result = await executeRun({
      cwd: TMP,
      params: { profile: "test-profile", task: "try dangerous" },
      projectPolicy: { paths: ["/nonexistent-allow/**"], tools: ["nosuch"] },
      mergedPolicy: null,
    });

    const blocked = result.events.filter((e) => e.status === "blocked");
    expect(blocked.length).toBeGreaterThan(0);
  });
});
