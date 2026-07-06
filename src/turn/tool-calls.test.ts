import { describe, it, expect, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendToolCall, getToolCall, queryToolCalls, updateToolCall } from "./tool-calls.ts";
import type { ToolCallInput } from "./types.ts";

const tmpDir = mkdtempSync(join(tmpdir(), "toolcalls-test-"));
const tablePath = join(tmpDir, "tool-calls.jsonl");

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const sampleCall: ToolCallInput = {
  turnId: "turn-001",
  toolName: "read",
  params: { path: "/home/project/src/db.ts" },
  content: [{ type: "text", text: "import { createPool } from 'pg';" }],
  durationMs: 120,
};

describe("appendToolCall", () => {
  it("appends a tool call record", async () => {
    const record = await appendToolCall(tablePath, "call-001", sampleCall);
    expect(record.id).toBe("call-001");
    expect(record.toolName).toBe("read");
    expect(record.truncated).toBe(false);
    expect(record.error).toBe(false);
  });
});

describe("getToolCall", () => {
  it("returns a tool call by id", async () => {
    const record = await getToolCall(tablePath, "call-001");
    expect(record).not.toBeNull();
    expect(record!.turnId).toBe("turn-001");
  });

  it("returns null for non-existent id", async () => {
    const record = await getToolCall(tablePath, "call-999");
    expect(record).toBeNull();
  });
});

describe("queryToolCalls", () => {
  it("filters by turnId", async () => {
    await appendToolCall(tablePath, "call-002", {
      ...sampleCall,
      turnId: "turn-002",
      toolName: "write",
      params: { path: "/tmp/out.ts" },
    });
    const results = await queryToolCalls(tablePath, { turnId: "turn-001" });
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe("call-001");
  });

  it("filters by toolName", async () => {
    const results = await queryToolCalls(tablePath, { toolName: "write" });
    expect(results).toHaveLength(1);
    expect(results[0]!.toolName).toBe("write");
  });

  it("returns all records with empty filter", async () => {
    const results = await queryToolCalls(tablePath, {});
    expect(results).toHaveLength(2);
  });
});

describe("updateToolCall", () => {
  it("updates error and truncated flags", async () => {
    const ok = await updateToolCall(tablePath, "call-001", { error: true, truncated: true });
    expect(ok).toBe(true);
    const record = await getToolCall(tablePath, "call-001");
    expect(record!.error).toBe(true);
    expect(record!.truncated).toBe(true);
  });
});
