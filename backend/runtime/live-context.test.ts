/**
 * Live integration tests for:
 *  - Dynamic context loading (scheduleEntries / unscheduleEntries)
 *  - Per-run context variation
 *  - Frequency limit enforcement
 *  - Session continuity with handoff
 *
 * Run: bun test backend/runtime/live-context.test.ts
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { reset } from "../computation/prompt/engine.ts";
import { executeRun } from "./mod.ts";
import { readEvents, readSession as readSessionFromStorage } from "../storage/mod.ts";
import type { RunDirectory } from "../storage/mod.ts";

const TMP = "/tmp/efficiency-live-test-" + randomUUID().slice(0, 8);

function writeProfile() {
  mkdirSync(`${TMP}/.profiles`, { recursive: true });
  writeFileSync(`${TMP}/.profiles/live-context.md`, [
    "---",
    "name: live-context",
    "description: Dynamic context loading test profile",
    "tools: [read, write, bash]",
    "registry:",
    "  - type: custom",
    "    name: coding-guide",
    "    description: Python编码规范",
    "    tags: [coding, python]",
    "    priority: 10",
    `    content: "【编码规范】使用4空格缩进，函数名用snake_case"`,
    "  - type: custom",
    "    name: api-reference",
    "    description: FastAPI核心API参考",
    "    tags: [api, fastapi]",
    "    priority: 8",
    `    content: "【API参考】@app.get() @app.post() — FastAPI装饰器"`,
    "    frequency:",
    "      maxTotal: 2",
    "  - type: custom",
    "    name: security-policy",
    "    description: 安全策略",
    "    tags: [security]",
    "    priority: 12",
    `    content: "【安全策略】永远不要硬编码密钥"`,
    "    frequency:",
    "      maxTotal: 1",
    "---",
    "You are a test agent. Task: ${task}",
    "Each piece of context can be loaded per run.",
  ].join("\n"));
}

function writeProjectPolicy(tools?: string[]) {
  const configDir = `${TMP}/.pi/efficiency-subagent`;
  mkdirSync(configDir, { recursive: true });
  writeFileSync(`${configDir}/config.json`, JSON.stringify({
    tools: tools ?? ["read", "write", "bash"],
    paths: ["*"],
  }));
}

/** Extract user prompt content from session.json. */
async function getUserPrompt(run: RunDirectory): Promise<string> {
  const session = await readSessionFromStorage(run.dir);
  return typeof session?.prompt === "string" ? session.prompt : "";
}

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
  writeFileSync(`${TMP}/project.txt`, "Project content for testing.");
  writeProfile();
  writeProjectPolicy();
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
  reset();
});

// ====================================================================
describe("Dynamic context loading — scheduleEntries", () => {
  it("injects scheduled entries into the prompt", async () => {
    const result = await executeRun({
      cwd: TMP,
      params: {
        profile: "live-context",
        task: "load coding guide and read project",
        actions: [
          { toolName: "scheduleEntries", scheduleTags: ["coding"] },
          { toolName: "read", filePath: "project.txt" },
        ],
      },
    });

    expect(result.status).toBe("completed");
    const content = await getUserPrompt(result.runDir);
    expect(content).toContain("【编码规范】");
    expect(content).toContain("4空格缩进");
    expect(content).not.toContain("【API参考】");
    expect(content).not.toContain("【安全策略】");

    const events = await readEvents(result.runDir.dir);
    expect(events.filter(e => e.type === "schedule_entries").length).toBe(1);
  });
});

// ====================================================================
describe("Per-run context variation", () => {
  it("loads different context for different runs with same profile", async () => {
    // Run 1: coding + api
    const r1 = await executeRun({
      cwd: TMP,
      params: {
        profile: "live-context",
        task: "load coding and api",
        actions: [
          { toolName: "scheduleEntries", scheduleTags: ["coding", "api"] },
          { toolName: "read", filePath: "project.txt" },
        ],
      },
    });
    expect(r1.status).toBe("completed");
    const u1 = await getUserPrompt(r1.runDir);
    expect(u1).toContain("【编码规范】");
    expect(u1).toContain("【API参考】");
    expect(u1).not.toContain("【安全策略】");

    // Run 2: security only (different context!)
    const r2 = await executeRun({
      cwd: TMP,
      params: {
        profile: "live-context",
        task: "load security only",
        actions: [
          { toolName: "scheduleEntries", scheduleTags: ["security"] },
          { toolName: "read", filePath: "project.txt" },
        ],
      },
    });
    expect(r2.status).toBe("completed");
    const u2 = await getUserPrompt(r2.runDir);
    expect(u2).not.toContain("【编码规范】");
    expect(u2).not.toContain("【API参考】");
    expect(u2).toContain("【安全策略】");

    // Two runs with SAME profile but DIFFERENT injected context
    expect(u1).not.toBe(u2);
  });
});

// ====================================================================
describe("Frequency limit enforcement", () => {
  it("blocks security-policy on second use (maxTotal=1)", async () => {
    // Run 1: security scheduled → injected
    const r1 = await executeRun({
      cwd: TMP,
      params: {
        profile: "live-context",
        task: "use security",
        actions: [
          { toolName: "scheduleEntries", scheduleTags: ["security"] },
          { toolName: "read", filePath: "project.txt" },
        ],
      },
    });
    expect(r1.status).toBe("completed");
    expect(await getUserPrompt(r1.runDir)).toContain("【安全策略】");

    // Run 2: try security again → frequency cap should block injection
    const r2 = await executeRun({
      cwd: TMP,
      params: {
        profile: "live-context",
        task: "try security again",
        actions: [
          { toolName: "scheduleEntries", scheduleTags: ["security"] },
          { toolName: "read", filePath: "project.txt" },
        ],
      },
    });
    expect(r2.status).toBe("completed");
    const u2 = await getUserPrompt(r2.runDir);
    expect(u2).not.toContain("【安全策略】"); // NOT injected (capped)
    expect(u2).toContain("安全策略"); // Still in ToC
  });

  it("api-reference works twice but not third time (maxTotal=2)", async () => {
    // Use 1
    await executeRun({
      cwd: TMP,
      params: {
        profile: "live-context",
        task: "use1",
        actions: [
          { toolName: "scheduleEntries", scheduleTags: ["api"] },
          { toolName: "read", filePath: "project.txt" },
        ],
      },
    });
    // Use 2
    const r2 = await executeRun({
      cwd: TMP,
      params: {
        profile: "live-context",
        task: "use2",
        actions: [
          { toolName: "scheduleEntries", scheduleTags: ["api"] },
          { toolName: "read", filePath: "project.txt" },
        ],
      },
    });
    expect(await getUserPrompt(r2.runDir)).toContain("【API参考】");

    // Use 3 should be capped
    const r3 = await executeRun({
      cwd: TMP,
      params: {
        profile: "live-context",
        task: "use3",
        actions: [
          { toolName: "scheduleEntries", scheduleTags: ["api"] },
          { toolName: "read", filePath: "project.txt" },
        ],
      },
    });
    expect(await getUserPrompt(r3.runDir)).not.toContain("【API参考】");
  });
});

// ====================================================================
describe("Unschedule", () => {
  it("removes entries via unscheduleEntries in same invocation", async () => {
    const result = await executeRun({
      cwd: TMP,
      params: {
        profile: "live-context",
        task: "schedule then unschedule",
        actions: [
          { toolName: "scheduleEntries", scheduleTags: ["coding", "api"] },
          { toolName: "unscheduleEntries", unscheduleTags: ["api"] },
          { toolName: "read", filePath: "project.txt" },
        ],
      },
    });

    expect(result.status).toBe("completed");
    const events = await readEvents(result.runDir.dir);
    expect(events.filter(e => e.type === "unschedule_entries").length).toBe(1);

    const content = await getUserPrompt(result.runDir);
    expect(content).toContain("【编码规范】");
    expect(content).not.toContain("【API参考】");
  });
});

// ====================================================================
describe("Continuation run", () => {
  it("preserves handoff across continuation with different context per run", async () => {
    // Run 1: coding
    const r1 = await executeRun({
      cwd: TMP,
      params: {
        profile: "live-context",
        task: "first run with coding",
        actions: [
          { toolName: "scheduleEntries", scheduleTags: ["coding"] },
          { toolName: "read", filePath: "project.txt" },
        ],
      },
    });
    expect(r1.status).toBe("completed");
    expect(await getUserPrompt(r1.runDir)).toContain("【编码规范】");

    const handoff = await readFile(r1.handoffPath, "utf-8");
    expect(handoff).toContain("live-context");
    expect(handoff).toContain("completed");

    // Run 2: continue with same runId, DIFFERENT context (api, not coding)
    const r2 = await executeRun({
      cwd: TMP,
      params: {
        profile: "live-context",
        task: "continue with api",
        runId: r1.runId,
        actions: [
          { toolName: "scheduleEntries", scheduleTags: ["api"] },
          { toolName: "read", filePath: "project.txt" },
        ],
      },
    });
    expect(r2.status).toBe("completed");

    // Continuation event logged
    const events = await readEvents(r2.runDir.dir);
    expect(events.filter(e => e.type === "run_continue").length).toBe(1);

    // Second run has different context
    const u2 = await getUserPrompt(r2.runDir);
    expect(u2).toContain("【API参考】");
    expect(u2).not.toContain("【编码规范】");
  });
});

// ====================================================================
describe("No-schedule baseline", () => {
  it("shows ToC but injects nothing when no scheduleEntries action", async () => {
    const result = await executeRun({
      cwd: TMP,
      params: {
        profile: "live-context",
        task: "just read",
        actions: [{ toolName: "read", filePath: "project.txt" }],
      },
    });

    expect(result.status).toBe("completed");
    const content = await getUserPrompt(result.runDir);
    expect(content).toContain("Available Context");
    expect(content).toContain("Python编码规范");
    expect(content).toContain("FastAPI核心API参考");
    expect(content).not.toContain("【编码规范】");
    expect(content).not.toContain("【API参考】");
    expect(content).not.toContain("【安全策略】");
  });
});
