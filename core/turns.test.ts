import { describe, it, expect, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { appendTurn, getTurn, queryTurns, updateTurn } from "./turns.ts";
import type { TurnInput } from "./types.ts";

const tmpDir = mkdtempSync("/tmp/turns-test-");
const tablePath = join(tmpDir, "turns.jsonl");

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const sampleTurn: TurnInput = {
  userText: "Write a function to query users",
  assistantBlocks: [
    { type: "text", text: "I'll look at the existing database setup first." },
  ],
};

describe("appendTurn", () => {
  it("appends a turn record and returns it", async () => {
    const record = await appendTurn(tablePath, "turn-001", join(tmpDir, "turn-001.md"), sampleTurn);
    expect(record.id).toBe("turn-001");
    expect(record.path).toContain("turn-001.md");
    expect(record.handoff).toBe("Write a function to query users");
    expect(record.tags).toEqual([]);
  });
});

describe("getTurn", () => {
  it("returns a turn by id", async () => {
    const record = await getTurn(tablePath, "turn-001");
    expect(record).not.toBeNull();
    expect(record!.id).toBe("turn-001");
  });

  it("returns null for non-existent id", async () => {
    const record = await getTurn(tablePath, "turn-999");
    expect(record).toBeNull();
  });
});

describe("queryTurns", () => {
  it("filters by ids", async () => {
    // Append a second turn
    await appendTurn(tablePath, "turn-002", join(tmpDir, "turn-002.md"), {
      userText: "Refactor the query",
      assistantBlocks: [{ type: "text", text: "OK" }],
    });
    const results = await queryTurns(tablePath, { ids: ["turn-001"] });
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe("turn-001");
  });

  it("filters by tags", async () => {
    await updateTurn(tablePath, "turn-001", { tags: ["database", "read"] });
    await updateTurn(tablePath, "turn-002", { tags: ["refactor"] });
    const results = await queryTurns(tablePath, { tags: ["database"] });
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe("turn-001");
  });

  it("returns all records with empty filter", async () => {
    const results = await queryTurns(tablePath, {});
    expect(results).toHaveLength(2);
  });
});

describe("updateTurn", () => {
  it("updates fields and returns true", async () => {
    const ok = await updateTurn(tablePath, "turn-001", {
      handoff: "Wrote database query function",
      tags: ["database", "read", "coding"],
    });
    expect(ok).toBe(true);
    const record = await getTurn(tablePath, "turn-001");
    expect(record!.handoff).toBe("Wrote database query function");
    expect(record!.tags).toEqual(["database", "read", "coding"]);
  });

  it("returns false for non-existent id", async () => {
    const ok = await updateTurn(tablePath, "turn-999", { handoff: "nope" });
    expect(ok).toBe(false);
  });
});
