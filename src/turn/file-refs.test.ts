// core/file-refs.test.ts
import { describe, it, expect, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendFileRef, getFileRef, queryFileRefs, updateFileRef } from "./file-refs.ts";
import type { FileRefInput } from "./types.ts";

const tmpDir = mkdtempSync(join(tmpdir(), "filerefs-test-"));
const tablePath = join(tmpDir, "file-refs.jsonl");

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const sampleRef: FileRefInput = {
  filePath: "/home/project/src/db.ts",
  turnId: "turn-001",
  toolCallId: "call-001",
  accessType: "read",
  handoff: "Database connection pool configuration",
};

describe("appendFileRef", () => {
  it("appends a file ref record", async () => {
    const record = await appendFileRef(tablePath, "ref-001", sampleRef);
    expect(record.id).toBe("ref-001");
    expect(record.accessType).toBe("read");
    expect(record.filePath).toBe("/home/project/src/db.ts");
  });
});

describe("getFileRef", () => {
  it("returns a file ref by id", async () => {
    const record = await getFileRef(tablePath, "ref-001");
    expect(record).not.toBeNull();
    expect(record!.toolCallId).toBe("call-001");
  });
});

describe("queryFileRefs", () => {
  it("filters by turnId", async () => {
    await appendFileRef(tablePath, "ref-002", {
      ...sampleRef,
      turnId: "turn-002",
      filePath: "/home/project/src/utils.ts",
      toolCallId: "call-003",
      accessType: "write",
    });
    const results = await queryFileRefs(tablePath, { turnId: "turn-001" });
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe("ref-001");
  });

  it("filters by accessType", async () => {
    const results = await queryFileRefs(tablePath, { accessType: "write" });
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe("ref-002");
  });

  it("filters by filePath glob", async () => {
    const results = await queryFileRefs(tablePath, { filePath: "/home/project/src/*" });
    expect(results).toHaveLength(2);
  });
});

describe("updateFileRef", () => {
  it("updates handoff field", async () => {
    const ok = await updateFileRef(tablePath, "ref-001", { handoff: "Updated summary" });
    expect(ok).toBe(true);
    const record = await getFileRef(tablePath, "ref-001");
    expect(record!.handoff).toBe("Updated summary");
  });
});
