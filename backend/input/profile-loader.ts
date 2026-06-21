import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  ProfileFrontmatterSchema,
  type ProfileFrontmatter,
  type ProfileDefinition,
} from "./schema.ts";

// ---------------------------------------------------------------------------
// Minimal recursive-descent YAML frontmatter parser
//
// Handles the YAML subset needed for ProfileFrontmatter:
//   - scalar key: value pairs
//   - nested objects via indentation
//   - arrays via "- item" syntax
//   - double/single-quoted strings
//   - YAML booleans, null, and numbers
//   - # comments (stripped outside quoted strings)
// ---------------------------------------------------------------------------

type YamlScalar = string | number | boolean | null;
type YamlValue = YamlScalar | YamlValue[] | { readonly [key: string]: YamlValue };

function parseScalar(raw: string): YamlScalar {
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  // Quoted strings
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  // Booleans
  if (trimmed === "true" || trimmed === "True" || trimmed === "TRUE") return true;
  if (trimmed === "false" || trimmed === "False" || trimmed === "FALSE") return false;
  // Null
  if (trimmed === "null" || trimmed === "Null" || trimmed === "NULL" || trimmed === "~")
    return null;
  // Number
  const num = Number(trimmed);
  if (!isNaN(num) && trimmed !== "") return num;
  // Plain string
  return trimmed;
}

/** Column of the first non-whitespace character (0-based). */
function indentOf(line: string): number {
  const match = /[^\s]/.exec(line);
  return match !== null ? match.index : line.length;
}

/**
 * Find the start of an unquoted `#` comment. Returns -1 if no
 * comment is found or if the `#` appears inside a quoted string.
 */
function findCommentStart(raw: string): number {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    if (inSingle) {
      if (ch === "'") inSingle = false;
    } else if (inDouble) {
      if (ch === '"') inDouble = false;
    } else {
      if (ch === "#") return i;
      if (ch === "'") inSingle = true;
      if (ch === '"') inDouble = true;
    }
  }
  return -1;
}

/**
 * Strip any trailing `#` comment (outside quoted strings) and
 * surrounding whitespace from a value segment.
 */
function stripComment(raw: string): string {
  const idx = findCommentStart(raw);
  return idx === -1 ? raw.trim() : raw.slice(0, idx).trim();
}

// ---- Recursive block / list parsers ----

function parseBlock(
  lines: readonly string[],
  startIdx: number,
  baseIndent: number,
): { value: Record<string, YamlValue>; nextIdx: number } {
  const result: Record<string, YamlValue> = {};
  let i = startIdx;

  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Skip blank lines and full-line comments
    if (trimmed === "" || trimmed.startsWith("#")) {
      i++;
      continue;
    }

    const indent = indentOf(line);
    if (indent < baseIndent) break; // back to parent indentation level

    // Only process keys at exactly the expected indentation
    if (indent !== baseIndent) {
      i++;
      continue;
    }

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) {
      i++;
      continue;
    }

    const key = trimmed.slice(0, colonIdx).trim();
    const rest = trimmed.slice(colonIdx + 1);
    const valueStr = stripComment(rest);

    if (valueStr === "") {
      // Value continues on following indented lines
      i = parseNestedValue(lines, i, indent, key, result);
    } else {
      // Scalar value on the same line
      result[key] = parseScalar(valueStr);
      i++;
    }
  }

  return { value: result, nextIdx: i };
}

/**
 * Handle a `key:` line where the value is empty — the actual value
 * (list or nested object) starts on the next indented line(s).
 */
function parseNestedValue(
  lines: readonly string[],
  currentIdx: number,
  keyIndent: number,
  key: string,
  result: Record<string, YamlValue>,
): number {
  // Scan forward past blank/comment lines to find the first content line
  let peek = currentIdx + 1;
  while (peek < lines.length) {
    const peekLine = lines[peek]!;
    const peekTrimmed = peekLine.trim();
    if (peekTrimmed !== "" && !peekTrimmed.startsWith("#")) break;
    peek++;
  }

  if (peek >= lines.length) {
    // No content lines follow — leave key unset (Zod treats as undefined)
    return currentIdx + 1;
  }

  const peekLine = lines[peek]!;
  const peekIndent = indentOf(peekLine);
  const peekTrimmed = peekLine.trim();

  if (peekIndent <= keyIndent) {
    // No indented children — leave key unset
    return currentIdx + 1;
  }

  if (peekTrimmed.startsWith("-")) {
    const parsed = parseList(lines, peek, peekIndent);
    result[key] = parsed.value;
    return parsed.nextIdx;
  }

  const parsed = parseBlock(lines, peek, peekIndent);
  result[key] = parsed.value;
  return parsed.nextIdx;
}

function parseList(
  lines: readonly string[],
  startIdx: number,
  baseIndent: number,
): { value: YamlValue[]; nextIdx: number } {
  const result: YamlValue[] = [];
  let i = startIdx;

  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();

    if (trimmed === "" || trimmed.startsWith("#")) {
      i++;
      continue;
    }

    const indent = indentOf(line);
    if (indent < baseIndent) break;

    if (indent === baseIndent && trimmed.startsWith("-")) {
      const itemContent = trimmed.slice(1);
      const valueStr = stripComment(itemContent);
      result.push(valueStr === "" ? null : parseScalar(valueStr));
      i++;
    } else {
      // Non-list-item at same indent ends the list
      break;
    }
  }

  return { value: result, nextIdx: i };
}

// ---- Frontmatter extraction ----

interface ParsedProfile {
  frontmatter: Record<string, YamlValue>;
  body: string;
}

/**
 * Split a markdown string into YAML frontmatter and body.
 * Returns null if the file does not start with a `---` delimiter.
 */
function extractFrontmatter(content: string): ParsedProfile | null {
  const lines = content.split("\n");

  let start = -1;
  let end = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.trim() === "---") {
      if (start === -1) {
        start = i;
      } else if (end === -1) {
        end = i;
        break;
      }
    }
  }

  if (start !== 0) return null; // first line must be ---
  if (end === -1) return null; // unclosed frontmatter

  const frontmatterLines = lines.slice(start + 1, end);
  const bodyLines = lines.slice(end + 1);

  const frontmatter =
    frontmatterLines.length === 0
      ? {}
      : parseBlock(frontmatterLines, 0, indentOf(frontmatterLines[0]!)).value;

  const body = bodyLines.join("\n").trim();

  return { frontmatter, body };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Resolve the `.profiles/` directory path for the given working directory. */
export function resolveProfileDir(cwd: string): string {
  return join(cwd, ".profiles");
}

/**
 * List all available profiles by scanning `.profiles/*.md` and parsing
 * only the YAML frontmatter of each file. Returns an empty array when
 * the `.profiles/` directory does not exist.
 */
export async function listProfiles(cwd: string): Promise<ProfileFrontmatter[]> {
  const dir = resolveProfileDir(cwd);

  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

  const profiles: ProfileFrontmatter[] = [];

  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;

    const filePath = join(dir, entry);
    let content: string;
    try {
      content = await readFile(filePath, "utf-8");
    } catch {
      continue; // skip unreadable files
    }

    const parsed = extractFrontmatter(content);
    if (parsed === null) continue;

    const validated = ProfileFrontmatterSchema.safeParse(parsed.frontmatter);
    if (validated.success) {
      profiles.push(validated.data);
    }
  }

  return profiles;
}

/**
 * Load a single profile by name from `.profiles/{profileName}.md`.
 *
 * Throws if the file does not exist, has missing/invalid YAML frontmatter,
 * or the frontmatter fails Zod validation against {@link ProfileFrontmatterSchema}.
 */
export async function loadProfile(
  cwd: string,
  profileName: string,
): Promise<ProfileDefinition> {
  const filePath = join(resolveProfileDir(cwd), `${profileName}.md`);

  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Profile "${profileName}" not found at ${filePath}: ${message}`);
  }

  const parsed = extractFrontmatter(content);
  if (parsed === null) {
    throw new Error(
      `Profile "${profileName}" is missing valid YAML frontmatter. ` +
        `Expected format:\n---\nname: ${profileName}\ndescription: ...\n---\n...markdown prompt...`,
    );
  }

  const validated = ProfileFrontmatterSchema.parse(parsed.frontmatter);

  return {
    frontmatter: validated,
    prompt: parsed.body,
  };
}
