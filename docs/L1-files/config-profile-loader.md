# L1: `config/profile-loader.ts`

**Purpose:** Load and parse `.profiles/*.md` files — reads YAML frontmatter from markdown profile files, validates them against the Zod schema, and returns structured profile definitions.

---

## Exported Symbols

### `resolveProfileDir(cwd: string): string` (line 413–415)
Resolves the `.profiles/` directory path relative to the given working directory. Simple one-liner wrapping `path.join(cwd, ".profiles")`.

### `listProfiles(cwd: string): Promise<ProfileFrontmatter[]>` (line 422–455)
Scans `.profiles/*.md`, extracts and validates the YAML frontmatter of each file, and returns an array of validated `ProfileFrontmatter` objects. Silently skips missing directories, unreadable files, and files with invalid frontmatter or schema violations.

### `loadProfile(cwd: string, profileName: string): Promise<ProfileDefinition>` (line 463–491)
Loads a single profile by name from `.profiles/{profileName}.md`. Returns a `ProfileDefinition` containing the validated `frontmatter` and the markdown `prompt` body. Throws if the file is missing, has no valid YAML frontmatter, or fails Zod validation.

---

## Key Internal Helpers

| Helper | Lines | Purpose |
|---|---|---|
| `parseScalar(raw)` | 24–51 | Parses a YAML scalar (string, number, boolean, null, inline array) |
| `indentOf(line)` | 54–57 | Returns the column of the first non-whitespace character (0-based) |
| `findCommentStart(raw)` | 63–79 | Finds the position of an unquoted `#` comment marker |
| `stripComment(raw)` | 85–88 | Removes trailing `#` comments from a value string |
| `parseBlock(lines, startIdx, baseIndent)` | 92–145 | Recursive descent: parses a YAML mapping block at a given indentation |
| `parseNestedValue(...)` | 151–190 | Handles `key:` lines whose value is on subsequent indented lines (list or nested block) |
| `parseBlockScalarFromLines(...)` | 192–234 | Parses YAML literal (`\|`) and folded (`>`) block scalars |
| `parseList(lines, startIdx, baseIndent)` | 236–363 | Recursive descent: parses a YAML list (`- item` syntax) with support for nested objects |
| `extractFrontmatter(content)` | 376–406 | Splits markdown content into YAML frontmatter (between `---` delimiters) and body |

The recursive-descent parser handles the YAML subset needed for profile frontmatter (scalars, nested objects, lists, block scalars, comments, quoted strings). Validation is deferred to `ProfileFrontmatterSchema` from `./schema.ts`.
