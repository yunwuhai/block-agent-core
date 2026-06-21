# L1 — `backend/input/schema.test.ts`

**Purpose:** Tests Zod schemas from `backend/input/mod.ts`: tool params, profile frontmatter, project policy, and action params.

## Suites

| Suite | Lines | Description |
|---|---|---|
| `ToolParamsSchema` | 4–55 | Validates required `profile`/`task`, optional `runId`/`actions`, generic extra-key stripping, and required-field rejection. |
| `ProfileFrontmatterSchema` | 57–74 | Validates minimal profile frontmatter and full frontmatter with tools/placeholders. |
| `ProjectPolicySchema` | 76–88 | Validates empty config and bash deny-list. |
| `ActionSchema` | 90–115 | Validates minimal actions, file path/command fields, empty tool name rejection, and missing tool name rejection. |

## Notes

- Profile frontmatter no longer accepts lifecycle script configuration.
- Extra unknown keys on tool params are stripped by Zod object parsing.
