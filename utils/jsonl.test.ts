import { describe, it, expect, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readJsonl, appendJsonl, writeJsonl, updateJsonl, deleteJsonl } from "./jsonl.ts";

const tmpDir = mkdtempSync("/tmp/jsonl-test-");

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

interface TestRecord {
  id: string;
  name: string;
  count: number;
}

describe("readJsonl", () => {
  it("returns empty array for non-existent file", async () => {
    const result = await readJsonl(join(tmpDir, "nonexistent.jsonl"));
    expect(result).toEqual([]);
  });

  it("reads valid records", async () => {
    const path = join(tmpDir, "read-test.jsonl");
    writeFileSync(path, '{"id":"a","name":"Alice","count":1}\n{"id":"b","name":"Bob","count":2}\n');
    const result = await readJsonl<TestRecord>(path);
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe("a");
    expect(result[1]!.name).toBe("Bob");
  });

  it("skips malformed lines", async () => {
    const path = join(tmpDir, "malformed.jsonl");
    writeFileSync(path, '{"id":"a","name":"Alice","count":1}\nnot-json\n{"id":"c","name":"Carol","count":3}\n');
    const result = await readJsonl<TestRecord>(path);
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe("a");
    expect(result[1]!.id).toBe("c");
  });

  it("skips empty lines", async () => {
    const path = join(tmpDir, "empty-lines.jsonl");
    writeFileSync(path, '{"id":"a","name":"Alice","count":1}\n\n\n{"id":"b","name":"Bob","count":2}\n');
    const result = await readJsonl<TestRecord>(path);
    expect(result).toHaveLength(2);
  });
});

describe("appendJsonl", () => {
  it("creates file and parent directories on first append", async () => {
    const path = join(tmpDir, "subdir", "append-test.jsonl");
    await appendJsonl(path, { id: "x", name: "X", count: 0 });
    const records = await readJsonl<TestRecord>(path);
    expect(records).toHaveLength(1);
    expect(records[0]!.id).toBe("x");
  });

  it("appends to existing file", async () => {
    const path = join(tmpDir, "append-existing.jsonl");
    writeFileSync(path, '{"id":"a","name":"Alice","count":1}\n');
    await appendJsonl(path, { id: "b", name: "Bob", count: 2 });
    const records = await readJsonl<TestRecord>(path);
    expect(records).toHaveLength(2);
  });
});

describe("writeJsonl", () => {
  it("writes records atomically", async () => {
    const path = join(tmpDir, "write-test.jsonl");
    const records: TestRecord[] = [
      { id: "1", name: "One", count: 1 },
      { id: "2", name: "Two", count: 2 },
    ];
    await writeJsonl(path, records);
    const result = await readJsonl<TestRecord>(path);
    expect(result).toEqual(records);
  });

  it("writes empty array as empty file", async () => {
    const path = join(tmpDir, "write-empty.jsonl");
    await writeJsonl(path, []);
    const result = await readJsonl(path);
    expect(result).toEqual([]);
  });
});

describe("updateJsonl", () => {
  it("updates an existing record", async () => {
    const path = join(tmpDir, "update-test.jsonl");
    writeFileSync(path, '{"id":"a","name":"Alice","count":1}\n{"id":"b","name":"Bob","count":2}\n');
    const ok = await updateJsonl<TestRecord>(path, "a", { count: 99 });
    expect(ok).toBe(true);
    const records = await readJsonl<TestRecord>(path);
    expect(records[0]!.count).toBe(99);
    expect(records[1]!.count).toBe(2);
  });

  it("returns false for non-existent id", async () => {
    const path = join(tmpDir, "update-missing.jsonl");
    writeFileSync(path, '{"id":"a","name":"Alice","count":1}\n');
    const ok = await updateJsonl<TestRecord>(path, "nonexistent", { count: 99 });
    expect(ok).toBe(false);
  });
});

describe("deleteJsonl", () => {
  it("deletes a record by id", async () => {
    const path = join(tmpDir, "delete-test.jsonl");
    writeFileSync(path, '{"id":"a","name":"Alice","count":1}\n{"id":"b","name":"Bob","count":2}\n');
    const ok = await deleteJsonl(path, "a");
    expect(ok).toBe(true);
    const records = await readJsonl<TestRecord>(path);
    expect(records).toHaveLength(1);
    expect(records[0]!.id).toBe("b");
  });

  it("returns false for non-existent id", async () => {
    const path = join(tmpDir, "delete-missing.jsonl");
    writeFileSync(path, '{"id":"a","name":"Alice","count":1}\n');
    const ok = await deleteJsonl(path, "nonexistent");
    expect(ok).toBe(false);
  });
});
