import { describe, it, expect, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defaultResolver } from "./load.ts";
import { appendJsonl } from "../../utils/jsonl.ts";
import type { Ref } from "../../core/types.ts";

const tmpDir = mkdtempSync("/tmp/load-resolver-test-");

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("defaultResolver", () => {
  it("resolves handoff mode", async () => {
    const refsPath = join(tmpDir, "refs.jsonl");
    await appendJsonl(refsPath, { id: "ref-001", handoff: "Found 3 bugs" });
    const ref: Ref = { file: refsPath, id: "ref-001", mode: "handoff" };
    expect(await defaultResolver(ref)).toBe("Found 3 bugs");
  });

  it("returns fallback for missing handoff ref", async () => {
    const ref: Ref = { file: join(tmpDir, "refs.jsonl"), id: "nonexistent", mode: "handoff" };
    expect(await defaultResolver(ref)).toContain("handoff not found");
  });

  it("resolves file content", async () => {
    writeFileSync(join(tmpDir, "f.txt"), "hello\nworld", "utf-8");
    const refsPath = join(tmpDir, "fr.jsonl");
    await appendJsonl(refsPath, { id: "r1", path: join(tmpDir, "f.txt") });
    expect(await defaultResolver({ file: refsPath, id: "r1" })).toBe("hello\nworld");
  });

  it("resolves file with lines range", async () => {
    writeFileSync(join(tmpDir, "lines.txt"), "a\nb\nc\nd\ne", "utf-8");
    const refsPath = join(tmpDir, "fr2.jsonl");
    await appendJsonl(refsPath, { id: "r2", path: join(tmpDir, "lines.txt") });
    expect(await defaultResolver({ file: refsPath, id: "r2", lines: "2-4" })).toBe("b\nc\nd");
  });

  it("returns fallback for error", async () => {
    const ref: Ref = { file: join(tmpDir, "nonexist.jsonl"), id: "nope" };
    expect(await defaultResolver(ref)).toContain("content not found");
  });
});
