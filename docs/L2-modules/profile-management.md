# L2 Module: Profile Management

**Purpose:** Load, parse, and validate subagent profile definitions from `.profiles/*.md`. Profiles configure allowed tools, prompt placeholders, registry entries, and the prompt body.

## Member Files

| L1 Doc | Summary |
|---|---|
| `config-profile-loader.md` | Recursive-descent YAML frontmatter parser plus profile loading helpers. |

## External Dependencies

| Depends on | Used For |
|---|---|
| `config-schema.md` | Validates parsed frontmatter with `ProfileFrontmatterSchema`. |

## Notes

- Lifecycle script configuration is not valid profile frontmatter.
- The parser is a purpose-built YAML subset parser; no external YAML dependency.
