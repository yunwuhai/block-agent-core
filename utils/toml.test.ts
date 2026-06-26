import { describe, it, expect, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { readToml, writeToml } from "./toml.ts";

const tmpDir = mkdtempSync("/tmp/toml-test-");

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("readToml", () => {
  it("parses a simple TOML file", async () => {
    // First write a file manually (since we test writeToml separately)
    const path = join(tmpDir, "simple.toml");
    await writeToml(path, {
      recipes: [
        {
          id: "test-recipe",
          name: "Test",
          description: "A test recipe",
          zones: [{ name: "config", description: "Config zone", position: "before", separator: "" }],
        },
      ],
    });
    const result = await readToml<{ recipes: Array<{ id: string }> }>(path);
    expect(result.recipes).toHaveLength(1);
    expect(result.recipes[0]!.id).toBe("test-recipe");
  });

  it("throws on invalid TOML", async () => {
    const path = join(tmpDir, "invalid.toml");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path, "this is not valid toml [[[", "utf-8");
    await expect(readToml(path)).rejects.toThrow();
  });
});

describe("writeToml", () => {
  it("writes TOML that round-trips correctly", async () => {
    const path = join(tmpDir, "roundtrip.toml");
    const data = {
      recipes: [
        {
          id: "r1",
          name: "Recipe 1",
          description: "First recipe",
          zones: [
            { name: "before", description: "Before zone", position: "before", separator: "---" },
          ],
        },
      ],
    };
    await writeToml(path, data);
    const result = await readToml<typeof data>(path);
    expect(result.recipes).toHaveLength(1);
    expect(result.recipes[0]!.id).toBe("r1");
    expect(result.recipes[0]!.zones).toHaveLength(1);
    expect(result.recipes[0]!.zones[0]!.name).toBe("before");
  });
});
