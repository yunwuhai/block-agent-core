# L2 Module: Profile Management

**Purpose:** Load, parse, and validate subagent profile definitions from YAML frontmatter in `.profiles/*.md` files — the primary mechanism for configuring subagent behavior (tools, hooks, placeholders, registry entries, prompt body).

## Member Files

| L1 Doc | Summary |
|--------|---------|
| `config-profile-loader.md` | Recursive-descent YAML parser for profile frontmatter, plus three public functions: `listProfiles()` (scan all `.profiles/*.md`), `loadProfile()` (load one by name with validation), and `resolveProfileDir()` (resolve `.profiles/` path). |

## Intra-Module Relationships

- Single-file module. All profile-loading logic is self-contained within the parser (scalars, lists, nested blocks, quoted strings, comments) and the three public entry points.

## External Dependencies

| Depends on (L1 doc) | How used |
|---------------------|----------|
| `config-schema.md` | Imports `ProfileFrontmatterSchema` to validate parsed YAML frontmatter against Zod schema; uses `ProfileFrontmatter` and `ProfileDefinition` types as return types. |

## Physical Location

| Source File | Current Path | Notes |
|------------|-------------|-------|
| `config/profile-loader.ts` | `backend/input/profile-loader.ts` | YAML frontmatter parser + `loadProfile()`, `listProfiles()` |

> **Step 4 reorganization status: COMPLETE.** Profile loading now lives in the Backend 输入 layer under `backend/input/`.

## Notes

- The parser is a purpose-built recursive descent for the YAML subset needed by profile frontmatter — no external YAML library dependency.
- `loadProfile()` throws on missing files, no frontmatter, or schema violations. `listProfiles()` silently skips invalid files.
- The `backend/input/mod.ts` barrel (`config-mod.md`) re-exports `loadProfile`, `listProfiles`, and `resolveProfileDir`.
