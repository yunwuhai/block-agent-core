import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { executeRun } from "../runtime/mod.ts";
import { reset } from "../runtime/prompt-slots/engine.ts";
import { mergePolicies } from "../policy/merge.ts";
import { evaluate } from "../policy/evaluator.ts";

const TMP = "/tmp/efficiency-perm-test-" + randomUUID().slice(0, 8);

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
  writeFileSync(`${TMP}/A.txt`, "Content of file A.");
  writeFileSync(`${TMP}/B.txt`, "Content of file B.");
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
  reset();
});

describe("Policy evaluator — file A allowed, file B blocked", () => {
  const policy = mergePolicies({
    tools: ["read"],
    paths: ["A.txt"],
  });

  it("allows tool=read path=A.txt", () => {
    const r = evaluate({ toolName: "read", filePath: "A.txt" }, policy);
    expect(r.allowed).toBe(true);
  });

  it("blocks tool=read path=B.txt (not in allowlist)", () => {
    const r = evaluate({ toolName: "read", filePath: "B.txt" }, policy);
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain("not allowed");
  });

  it("blocks tool=write path=A.txt (tool not allowed)", () => {
    const r = evaluate({ toolName: "write", filePath: "A.txt" }, policy);
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain("not in allowed list");
  });

  it("allows tool=read path=B.txt when policy allows *", () => {
    const wild = mergePolicies({ tools: ["read"], paths: ["*"] });
    const r = evaluate({ toolName: "read", filePath: "B.txt" }, wild);
    expect(r.allowed).toBe(true);
  });
});

describe("Runtime — agent reads A.txt (policy allows)", () => {
  it("completes with tool_call event, no blocks", async () => {
    const result = await executeRun({
      cwd: TMP,
      params: { profile: "restricted-agent", task: "read A.txt" },
      projectPolicy: { tools: ["read"], paths: ["A.txt"] },
      mergedPolicy: null,
      filePath: "A.txt",
    });

    expect(result.status).toBe("completed");
    const blocks = result.events.filter((e) => e.status === "blocked");
    expect(blocks.length).toBe(0);
    const toolCalls = result.events.filter((e) => e.type === "tool_call");
    expect(toolCalls.length).toBe(1);
    expect(toolCalls[0]?.label).toContain("read");
  });
});

describe("Runtime — agent tries B.txt (policy blocks)", () => {
  it("emits a policy_block event, no tool call", async () => {
    const result = await executeRun({
      cwd: TMP,
      params: { profile: "restricted-agent", task: "try B.txt" },
      projectPolicy: { tools: ["read"], paths: ["A.txt"] },
      mergedPolicy: null,
      filePath: "B.txt",
    });

    const blocks = result.events.filter((e) => e.status === "blocked");
    expect(blocks.length).toBe(1);
    expect(blocks[0]?.type).toBe("policy");
    expect(blocks[0]?.detail).toContain("not allowed");

    const toolCalls = result.events.filter((e) => e.type === "tool_call");
    expect(toolCalls.length).toBe(0);
  });
});

describe("Cross-verification: both files exist on disk", () => {
  it("A.txt exists and is readable", () => {
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const content = readFileSync(`${TMP}/A.txt`, "utf-8");
    expect(content).toContain("Content of file A");
  });

  it("B.txt exists and is readable", () => {
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const content = readFileSync(`${TMP}/B.txt`, "utf-8");
    expect(content).toContain("Content of file B");
  });
});
