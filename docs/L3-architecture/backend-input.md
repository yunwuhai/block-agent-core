# L3 Architecture: Backend — 输入 (Input)

Backend input modules parse, load, and validate data entering the system: tool parameters, profile frontmatter, project policy, and registry entry declarations.

## Member Modules

| # | Module | Primary | Description | L2 Doc |
|---|--------|---------|-------------|--------|
| 1 | `configuration` | 输入 | Zod schemas for tool parameters, profile frontmatter, registry entries, and project policy. | [configuration.md](../L2-modules/configuration.md) |
| 2 | `profile-management` | 输入 | Loads and validates `.profiles/*.md` definitions. | [profile-management.md](../L2-modules/profile-management.md) |
| 3 | `project-policy` | 输入 | Loads `.pi/efficiency-subagent/config.json` policy. | [project-policy.md](../L2-modules/project-policy.md) |

## Accepted Profile Surface

Profiles can declare:

- `name`, `description`
- `model`
- `tools`
- `permissions`
- `placeholders`
- `registry`

Profiles do not accept lifecycle extension configuration. Use explicit `actions` and registry/placeholders for controllable execution and context injection.
