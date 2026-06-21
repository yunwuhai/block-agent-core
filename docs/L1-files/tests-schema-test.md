# tests/schema.test.ts

## File Purpose

Validates all Zod schemas defined in `config/mod.ts` via `bun:test`. Covers parsing, coercion,
optional-field behavior, strict-mode extra-key stripping, and required-field rejection for the
four core schema types used by the efficiency-subagent plugin.

## Test Suites

| Suite | Lines | Description |
|-------|-------|-------------|
| `ToolParamsSchema` | 4–55 | Subagent invocation parameters: validates required `profile`/`task`, optional `runId`/`actions[]`, extra-key stripping, and rejection when required fields are missing. 8 tests. |
| `ProfileFrontmatterSchema` | 57–77 | Profile metadata (name, description, tools, hooks): minimal vs full frontmatter acceptance. 2 tests. |
| `ProjectPolicySchema` | 79–91 | Project-level policy config: empty config and bash deny-list. 2 tests. |
| `ActionSchema` | 93–118 | Individual action objects: toolName + optional filePath/command, empty-toolName rejection, missing-toolName rejection. 5 tests. |

## Key Scenarios Covered

- **Required-field enforcement**: missing `profile` or `task` → `success: false`
- **Optional extras**: `runId` and `actions[]` accepted when present, absent when omitted
- **Strict unknown-key stripping**: extra keys like `workflow` are silently removed, not rejected
- **Action validation**: empty string `toolName` is rejected, but any non-empty string passes
- **Edge cases**: empty project policy (`{}`), minimal profile (name-only), full profile with nested hook scripts object
