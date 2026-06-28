// core/templates.test.ts
import { describe, it, expect, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { appendTemplate, getTemplate, queryTemplates, updateTemplate } from "./templates.ts";
import type { TemplateInput } from "./types.ts";

const tmpDir = mkdtempSync("/tmp/templates-test-");
const tablePath = join(tmpDir, "templates.jsonl");

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const sampleInput: TemplateInput = {
  path: "templates/code-review.md",
  tags: ["review", "code"],
};

describe("appendTemplate", () => {
  it("appends a template record", async () => {
    const record = await appendTemplate(tablePath, "tmpl-001", "templates/code-review.md", sampleInput);
    expect(record.id).toBe("tmpl-001");
    expect(record.tags).toEqual(["review", "code"]);
  });
});

describe("getTemplate", () => {
  it("returns a template by id", async () => {
    const record = await getTemplate(tablePath, "tmpl-001");
    expect(record).not.toBeNull();
    expect(record!.id).toBe("tmpl-001");
  });

  it("returns null for non-existent id", async () => {
    const record = await getTemplate(tablePath, "tmpl-999");
    expect(record).toBeNull();
  });
});

describe("queryTemplates", () => {
  it("filters by tags", async () => {
    await appendTemplate(tablePath, "tmpl-002", "templates/deploy.md", {
      path: "templates/deploy.md",
      tags: ["deploy", "bash"],
    });
    const results = await queryTemplates(tablePath, { tags: ["review"] });
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe("tmpl-001");
  });

  it("returns all with empty filter", async () => {
    const results = await queryTemplates(tablePath, {});
    expect(results).toHaveLength(2);
  });
});

describe("updateTemplate", () => {
  it("updates tags", async () => {
    const ok = await updateTemplate(tablePath, "tmpl-001", {
      tags: ["review", "code", "updated"],
    });
    expect(ok).toBe(true);
    const record = await getTemplate(tablePath, "tmpl-001");
    expect(record!.tags).toContain("updated");
  });
});
