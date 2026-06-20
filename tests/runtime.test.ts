import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { executeRun } from "../runtime/mod.ts";
import { reset } from "../runtime/prompt-slots/engine.ts";

const TMP = "/tmp/efficiency-subagent-test-" + randomUUID().slice(0, 8);

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
  mkdirSync(`${TMP}/.profiles`, { recursive: true });
  writeFileSync(`${TMP}/.profiles/test-profile.md`, [
    "---",
    "name: test-profile",
    "description: Test profile for smoke tests",
    "---",
    "You are a test agent. Execute the task: ${task}",
  ].join("\n"));
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
    });

    expect(result.status).toBe("completed");
    expect(result.runId).toBeTruthy();
    expect(result.handoffPath).toContain("handoff.md");
    expect(result.events.length).toBeGreaterThan(0);

    const runStartEvents = result.events.filter((e) => e.type === "run_start");
    expect(runStartEvents.length).toBe(1);
  });

  it("blocks a tool call when policy denies it", async () => {
    // Create project policy config
    const configDir = `${TMP}/.pi/efficiency-subagent`;
    mkdirSync(configDir, { recursive: true });
    writeFileSync(`${configDir}/config.json`, JSON.stringify({
      paths: ["/nonexistent-allow/**"],
      tools: ["nosuch"],
    }));

    const result = await executeRun({
      cwd: TMP,
      params: { profile: "test-profile", task: "try dangerous" },
    });

    const blocked = result.events.filter((e) => e.status === "blocked");
    expect(blocked.length).toBeGreaterThan(0);
  });

  it("executes multi-action sequence from actions array", async () => {
    const result = await executeRun({
      cwd: TMP,
      params: {
        profile: "test-profile",
        task: "multi-action smoke test",
        actions: [
          { toolName: "mkdir", command: "mkdir test-dir" },
          { toolName: "write", filePath: "test-dir/file.txt" },
        ],
      },
    });

    expect(result.status).toBe("completed");
    expect(result.runId).toBeTruthy();
    const toolCalls = result.events.filter((e) => e.type === "tool_call");
    expect(toolCalls.length).toBe(2);
  });
});
