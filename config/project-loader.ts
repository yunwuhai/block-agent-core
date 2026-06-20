import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ProjectPolicySchema, type ProjectPolicy } from "./schema.ts";

/**
 * Load the project-level policy from `.pi/efficiency-subagent/config.json`.
 *
 * Returns `null` (graceful — no policy = allow all) when:
 * - The file does not exist
 * - The file contains invalid JSON
 * - The parsed value fails Zod validation against {@link ProjectPolicySchema}
 */
export async function loadProjectPolicy(cwd: string): Promise<ProjectPolicy | null> {
  const configPath = join(cwd, ".pi", "efficiency-subagent", "config.json");

  let rawText: string;
  try {
    rawText = await readFile(configPath, "utf-8");
  } catch {
    return null;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(rawText);
  } catch {
    return null;
  }

  const validated = ProjectPolicySchema.safeParse(raw);
  if (!validated.success) {
    return null;
  }

  return validated.data;
}
