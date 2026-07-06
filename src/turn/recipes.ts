import { readToml, writeToml } from "../utils/toml.ts";
import type { Recipe, RecipesFile } from "./types.ts";

export async function loadRecipes(recipePath: string): Promise<Recipe[]> {
  try {
    const data = await readToml<RecipesFile>(recipePath);
    return data.recipes ?? [];
  } catch {
    // File doesn't exist or is invalid — return empty
    return [];
  }
}

export async function getRecipe(
  recipePath: string,
  id: string,
): Promise<Recipe | null> {
  const recipes = await loadRecipes(recipePath);
  return recipes.find(r => r.id === id) ?? null;
}

export async function addRecipe(
  recipePath: string,
  recipe: Recipe,
): Promise<void> {
  const recipes = await loadRecipes(recipePath);
  recipes.push(recipe);
  await writeToml(recipePath, { recipes } satisfies RecipesFile);
}

export async function updateRecipe(
  recipePath: string,
  id: string,
  patch: Partial<Recipe>,
): Promise<boolean> {
  const recipes = await loadRecipes(recipePath);
  const index = recipes.findIndex(r => r.id === id);
  if (index === -1) return false;
  recipes[index] = { ...recipes[index]!, ...patch };
  await writeToml(recipePath, { recipes } satisfies RecipesFile);
  return true;
}
