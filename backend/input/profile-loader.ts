import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ProfileFrontmatterSchema,
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

function parseScalar(raw: string): YamlValue {
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  // Quoted strings
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  // Inline arrays: [item1, item2, ...]
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim();
    if (inner === "") return [];
    return inner.split(",").map((item) => parseScalar(item.trim()));
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
    } else if (valueStr === "|" || valueStr === "|-" || valueStr === ">" || valueStr === ">-") {
      // Literal (|) or folded (>) block scalar — capture indented lines as string
      const scalarResult = parseBlockScalarFromLines(lines, i);
      result[key] = scalarResult.value;
      i = scalarResult.nextIdx;
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

function parseBlockScalarFromLines(
  lines: readonly string[],
  afterKeyLine: number,
): { value: string; nextIdx: number } {
  // The line after the key line (which had | or >) may be the indicator line itself,
  // or the first content line. Skip past blank/comment lines to find the first content.
  let i = afterKeyLine + 1;
  while (i < lines.length) {
    const t = lines[i]!.trim();
    if (t !== "" && !t.startsWith("#")) break;
    i++;
  }

  if (i >= lines.length) return { value: "", nextIdx: i };

  // The first content line establishes the indent of the scalar block.
  const contentIndent = indentOf(lines[i]!);
  const parts: string[] = [];

  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Blank lines inside scalar blocks are preserved as empty strings
    if (trimmed === "") {
      parts.push("");
      i++;
      continue;
    }

    // Full-line comments may appear inside scalar blocks at the content indent —
    // YAML treats these as content, not comments. Keep them as-is.
    // A line at less indent than contentIndent ends the block scalar.
    const lineIndent = indentOf(line);
    if (lineIndent < contentIndent) break;

    // Content line — strip the common indent (contentIndent) and keep the rest
    parts.push(line.slice(contentIndent));
    i++;
  }

  return { value: parts.join("\n"), nextIdx: i };
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
      const itemContent = trimmed.slice(1); // skip "-"
      const valueStr = stripComment(itemContent);

      if (valueStr === "") {
        // Empty list item: check for nested content on next indented lines
        let peek = i + 1;
        while (peek < lines.length) {
          const pt = lines[peek]!.trim();
          if (pt !== "" && !pt.startsWith("#")) break;
          peek++;
        }
        if (peek < lines.length && indentOf(lines[peek]!) > baseIndent) {
          const pt = lines[peek]!.trim();
          if (pt.startsWith("-")) {
            const nested = parseList(lines, peek, indentOf(lines[peek]!));
            result.push(nested.value);
            i = nested.nextIdx;
          } else {
            const nested = parseBlock(lines, peek, indentOf(lines[peek]!));
            result.push(nested.value);
            i = nested.nextIdx;
          }
        } else {
          result.push(null);
          i++;
        }
      } else if (valueStr.includes(":")) {
        // Potential inline object start: "- key: value"
        // Parse the first key-value pair, then continue with indented properties
        const colonIdx = valueStr.indexOf(":");
        const firstKey = valueStr.slice(0, colonIdx).trim();
        const firstRest = valueStr.slice(colonIdx + 1).trimStart();
        const firstValueStr = stripComment(firstRest);

        // Build the object starting with this first key
        const obj: Record<string, YamlValue> = {};

        if (firstValueStr === "|" || firstValueStr === "|-" || firstValueStr === ">" || firstValueStr === ">-") {
          // Block scalar value on the first property
          const scalarResult = parseBlockScalarFromLines(lines, i);
          obj[firstKey] = scalarResult.value;
          i = scalarResult.nextIdx;
        } else {
          obj[firstKey] = firstValueStr === "" ? "" : parseScalar(firstValueStr);
          i++;
        }

        // Check if next lines continue this object (more indented properties)
        while (i < lines.length) {
          const nextLine = lines[i]!;
          const nextTrimmed = nextLine.trim();

          // Skip blank/comment lines
          if (nextTrimmed === "" || nextTrimmed.startsWith("#")) {
            i++;
            continue;
          }

          const nextIndent = indentOf(nextLine);

          // If next content line is at baseIndent or less, it's a new list item
          if (nextIndent <= baseIndent) break;

          // If it's at an indent matching the expected property indent,
          // parse it as a property of this object
          if (nextTrimmed.includes(":")) {
            const nColon = nextTrimmed.indexOf(":");
            const nKey = nextTrimmed.slice(0, nColon).trim();
            const nRest = nextTrimmed.slice(nColon + 1);
            const nValueStr = stripComment(nRest);

            if (nValueStr === "") {
              // Nested value continues on further indented lines
              const dummy: Record<string, YamlValue> = {};
              i = parseNestedValue(lines, i, nextIndent, nKey, dummy);
              if (nKey in dummy) {
                obj[nKey] = dummy[nKey]!;
              }
            } else if (nValueStr === "|" || nValueStr === "|-" || nValueStr === ">" || nValueStr === ">-") {
              const scalarResult = parseBlockScalarFromLines(lines, i);
              obj[nKey] = scalarResult.value;
              i = scalarResult.nextIdx;
            } else {
              obj[nKey] = parseScalar(nValueStr);
              i++;
            }
          } else {
            // Content line without colon — probably a continuation or error
            // Break to avoid infinite loop
            break;
          }
        }

        result.push(obj);
      } else {
        // Simple scalar list item: "- value"
        result.push(parseScalar(valueStr));
        i++;
      }
    } else {
      // Non-list-item at same indent or deeper ends the list
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
function resolveProfileDir(cwd: string): string {
  return join(cwd, ".profiles");
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
