// core/build-prompt.ts
import { readToml } from "../utils/toml.ts";
import type { CallRecord, Recipe, RecipesFile, Ref, Zone } from "./types.ts";

function resolveZone(
  zone: Zone,
  refs: Ref[],
  resolver: (ref: Ref) => string,
): string {
  if (refs.length === 0) return "";
  const parts = refs.map(ref => resolver(ref));
  const body = parts.join(zone.separator ?? "");
  let result = "";
  if (zone.separator_before) result += zone.separator_before + "\n";
  result += body;
  if (zone.separator_after && body) result += "\n" + zone.separator_after;
  return result.trim();
}

export function buildPromptFromRecipe(
  recipe: Recipe,
  callRecord: CallRecord,
  resolver: (ref: Ref) => string,
): string {
  const beforeZones = recipe.zones.filter(z => z.position === "before");
  const afterZones = recipe.zones.filter(z => z.position === "after");

  const beforeParts: string[] = [];
  for (const zone of beforeZones) {
    const refs = callRecord.zones[zone.name] ?? [];
    const content = resolveZone(zone, refs, resolver);
    if (content) beforeParts.push(content);
  }

  const afterParts: string[] = [];
  for (const zone of afterZones) {
    const refs = callRecord.zones[zone.name] ?? [];
    const content = resolveZone(zone, refs, resolver);
    if (content) afterParts.push(content);
  }

  const sections: string[] = [];
  if (beforeParts.length > 0) sections.push(beforeParts.join("\n\n"));
  sections.push("{{CURRENT_TURN}}");
  if (afterParts.length > 0) sections.push(afterParts.join("\n\n"));

  return sections.join("\n\n");
}

export async function buildPrompt(
  recipePath: string,
  callRecord: CallRecord,
  resolver: (ref: Ref) => string,
): Promise<string> {
  const data = await readToml<RecipesFile>(recipePath);
  const recipes = data.recipes ?? [];
  const recipe = recipes.find(r => r.id === callRecord.recipeId);
  if (!recipe) {
    throw new Error(`Recipe "${callRecord.recipeId}" not found in ${recipePath}`);
  }
  return buildPromptFromRecipe(recipe, callRecord, resolver);
}
