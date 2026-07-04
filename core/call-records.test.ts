import { describe, it, expect, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendCallRecord, getCallRecord, queryCallRecords, updateCallRecord } from "./call-records.ts";
import type { CallRecordInput, Ref } from "./types.ts";

const tmpDir = mkdtempSync(join(tmpdir(), "callrecords-test-"));
const tablePath = join(tmpDir, "call-records.jsonl");

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const sampleZones: Record<string, Ref[]> = {
  config: [{ file: "/data/templates.jsonl", id: "tmpl-001" }],
  presets: [{ file: "/data/templates.jsonl", id: "tmpl-001" }],
  history: [{ file: "/data/turns.jsonl", id: "turn-000", mode: "handoff" }],
  attachments: [{ file: "/data/refs.jsonl", id: "ref-001", lines: "1-80" }],
  emphasis: [],
};

const sampleRec: CallRecordInput = {
  turnId: "turn-001",
  recipeId: "default-context",
  zones: sampleZones,
};

describe("appendCallRecord", () => {
  it("appends a call record with zones", async () => {
    const record = await appendCallRecord(tablePath, "rec-001", sampleRec);
    expect(record.id).toBe("rec-001");
    expect(record.recipeId).toBe("default-context");
    expect(record.zones.config).toHaveLength(1);
    expect(record.zones.history![0]!.mode).toBe("handoff");
  });
});

describe("getCallRecord", () => {
  it("returns a call record by id", async () => {
    const record = await getCallRecord(tablePath, "rec-001");
    expect(record).not.toBeNull();
    expect(record!.turnId).toBe("turn-001");
  });
});

describe("queryCallRecords", () => {
  it("filters by recipeId", async () => {
    await appendCallRecord(tablePath, "rec-002", {
      turnId: "turn-002",
      recipeId: "minimal-context",
      zones: { config: [], presets: [], history: [], attachments: [], emphasis: [] },
    });
    const results = await queryCallRecords(tablePath, { recipeId: "default-context" });
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe("rec-001");
  });

  it("returns all with empty filter", async () => {
    const results = await queryCallRecords(tablePath, {});
    expect(results).toHaveLength(2);
  });
});

describe("updateCallRecord", () => {
  it("updates zones", async () => {
    const newZones = { ...sampleZones, emphasis: [{ file: "/data/templates.jsonl", id: "tmpl-002" }] };
    const ok = await updateCallRecord(tablePath, "rec-001", { zones: newZones });
    expect(ok).toBe(true);
    const record = await getCallRecord(tablePath, "rec-001");
    expect(record!.zones.emphasis).toHaveLength(1);
  });
});
