# L2 Module: Configuration Schema & Validation

**Purpose:** Core input type system for efficiency-subagent. Defines Zod schemas for tool params, profile frontmatter, prompt registry entries, and project policy; provides runtime validation for tool invocation parameters.

## Member Files

| L1 Doc | Summary |
|---|---|
| `config-schema.md` | Zod schemas: `ToolParamsSchema`, `ProfileFrontmatterSchema`, `RegistryEntrySchema`, `ProjectPolicySchema`, and inferred types. |
| `config-params.md` | Thin `validateToolParams(raw)` wrapper around `ToolParamsSchema.parse()`. |

## Relationships

- `config-params.md` depends on `config-schema.md`.
- Profile frontmatter now models tools, placeholders, and registry entries only. Lifecycle scripts are not part of the accepted profile configuration.

## Physical Location

| Source File | Current Path |
|---|---|
| `config/schema.ts` | `backend/input/schema.ts` |
| `config/params.ts` | `backend/input/params.ts` |
