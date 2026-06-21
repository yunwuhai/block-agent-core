# `backend/input/mod.ts` — Input module barrel

**Purpose:** Barrel file for the input module. Re-exports schema values/types, parameter validation, profile loading, and project-policy loading so consumers do not import individual files directly.

## Exports

| Export | Kind | Line | Description |
|---|---|---|---|
| `ActionSchema` | value | 2 | Zod schema for tool action definitions. |
| `ActionParams` | type | 3 | Inferred params type from `ActionSchema`. |
| `ToolParamsSchema` | value | 4 | Zod schema for tool invocation parameters. |
| `ToolParams` | type | 5 | Inferred type from `ToolParamsSchema`. |
| `ProfileFrontmatterSchema` | value | 6 | Zod schema for profile YAML frontmatter. |
| `ProfileFrontmatter` | type | 7 | Inferred type from `ProfileFrontmatterSchema`. |
| `ProfileDefinition` | type | 8 | Resolved profile definition type. |
| `ProjectPolicySchema` | value | 9 | Zod schema for project-level policy. |
| `ProjectPolicy` | type | 10 | Inferred type from `ProjectPolicySchema`. |
| `validateToolParams` | function | 12 | Validate tool params against schema. |
| `loadProfile` | function | 13 | Load a profile by name from `.profiles/`. |
| `loadProjectPolicy` | function | 14 | Load project-level policy from config. |

## Source

Re-exports from:
- `./schema.ts` — Zod schemas and inferred types.
- `./params.ts` — `validateToolParams`.
- `./profile-loader.ts` — `loadProfile`.
- `./project-loader.ts` — `loadProjectPolicy`.
