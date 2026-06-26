import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import * as toml from "smol-toml";

/**
 * Read and parse a TOML file. Throws on parse errors.
 */
export async function readToml<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf-8");
  return toml.parse(raw) as T;
}

/**
 * Serialize data to TOML and write to file.
 * Creates parent directories if needed.
 */
export async function writeToml<T>(filePath: string, data: T): Promise<void> {
  const content = toml.stringify(data as Record<string, unknown>);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf-8");
}
