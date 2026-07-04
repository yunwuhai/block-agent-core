import { describe, it, expect, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRecipes, getRecipe, addRecipe, updateRecipe } from "./recipes.ts";
import type { Recipe } from "./types.ts";

const tmpDir = mkdtempSync(join(tmpdir(), "recipes-test-"));
const recipePath = join(tmpDir, "recipes.toml");

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const sampleRecipe: Recipe = {
  id: "default-context",
  name: "Default Context",
  description: "Standard dialogue context assembly",
  zones: [
    {
      name: "config",
      description: "Tool tables config",
      position: "before",
      separator: "",
    },
    {
      name: "presets",
      description: "Preset prompts",
      position: "before",
      separator: "---presets---",
    },
    {
      name: "history",
      description: "Historical turns",
      position: "before",
      separator_before: "---context start---",
      separator_after: "---context end---",
    },
    {
      name: "attachments",
      description: "Referenced file contents",
      position: "after",
      separator: "---attachment---",
    },
    {
      name: "emphasis",
      description: "Emphasis information at end",
      position: "after",
      separator: "",
    },
  ],
};

describe("loadRecipes", () => {
  it("returns empty array for non-existent file", async () => {
    const recipes = await loadRecipes(join(tmpDir, "nonexistent.toml"));
    expect(recipes).toEqual([]);
  });
});

describe("addRecipe", () => {
  it("adds a recipe and it round-trips correctly", async () => {
    await addRecipe(recipePath, sampleRecipe);
    const recipes = await loadRecipes(recipePath);
    expect(recipes).toHaveLength(1);
    expect(recipes[0]!.id).toBe("default-context");
    expect(recipes[0]!.zones).toHaveLength(5);
    expect(recipes[0]!.zones[2]!.separator_before).toBe("---context start---");
  });
});

describe("getRecipe", () => {
  it("returns a recipe by id", async () => {
    const recipe = await getRecipe(recipePath, "default-context");
    expect(recipe).not.toBeNull();
    expect(recipe!.name).toBe("Default Context");
  });

  it("returns null for non-existent id", async () => {
    const recipe = await getRecipe(recipePath, "nonexistent");
    expect(recipe).toBeNull();
  });
});

describe("updateRecipe", () => {
  it("updates recipe fields", async () => {
    const ok = await updateRecipe(recipePath, "default-context", {
      description: "Updated description",
    });
    expect(ok).toBe(true);
    const recipe = await getRecipe(recipePath, "default-context");
    expect(recipe!.description).toBe("Updated description");
  });

  it("returns false for non-existent id", async () => {
    const ok = await updateRecipe(recipePath, "nonexistent", { name: "X" });
    expect(ok).toBe(false);
  });
});
