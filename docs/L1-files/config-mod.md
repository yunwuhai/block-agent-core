# config/mod.ts — Config module barrel

**Purpose:** Barrel / index file for the `config/` module. Re-exports all schema types, validation helpers, profile loaders, and the project-policy loader so consumers import from `config/mod.ts` instead of individual files.

## Exports

| Export | Kind | Line | Description |
|---|---|---|---|
| `ActionSchema` | value | 1–14 | Zod schema for tool action definitions |
| `ActionParams` | type | 1–14 | Inferred params type from `ActionSchema` |
| `ToolParamsSchema` | value | 1–14 | Zod schema for tool invocation parameters |
| `ToolParams` | type | 1–14 | Inferred type from `ToolParamsSchema` |
| `ProfileFrontmatterSchema` | value | 1–14 | Zod schema for profile YAML frontmatter |
| `ProfileFrontmatter` | type | 1–14 | Inferred type from `ProfileFrontmatterSchema` |
| `ProfileDefinition` | type | 1–14 | Resolved profile definition type |
| `HooksConfigSchema` | value | 1–14 | Zod schema for hooks configuration |
| `HooksConfig` | type | 1–14 | Inferred type from `HooksConfigSchema` |
| `ToolHookSchema` | value | 1–14 | Zod schema for individual hook definitions |
| `ProjectPolicySchema` | value | 1–14 | Zod schema for project-level policy |
| `ProjectPolicy` | type | 1–14 | Inferred type from `ProjectPolicySchema` |
| `validateToolParams` | function | 15 | Validate tool params against schema, return normalized result |
| `loadProfile` | function | 16 | Load a profile by name from configured directories |
| `listProfiles` | function | 16 | List all available profile names |
| `resolveProfileDir` | function | 16 | Resolve filesystem path for a given profile name |
| `loadProjectPolicy` | function | 17 | Load and merge project-level policy from config |

## Source

Re-exports from:
- `./schema.ts` — Zod schemas and inferred types
- `./params.ts` — `validateToolParams`
- `./profile-loader.ts` — `loadProfile`, `listProfiles`, `resolveProfileDir`
- `./project-loader.ts` — `loadProjectPolicy`
