# L1 — `config/schema.ts`

**Purpose:** Zod schema definitions for the efficiency-subagent configuration layer — validates tool invocation params, profile YAML frontmatter, prompt registry entries, hook configs, and project-level policy.

---

## Exports

| Symbol | Kind | Lines | Description |
|---|---|---|---|
| `ActionSchema` | `z.ZodObject` | 5–11 | Single tool action: `toolName` (required) + optional `filePath`, `command`, `url`, `envVar`. |
| `ActionParams` | type | 13 | Inferred type from `ActionSchema`. |
| `ToolParamsSchema` | `z.ZodObject` | 15–21 | Top-level invocation payload: `profile`, `task`, optional `runId` and `actions` array. |
| `ToolParams` | type | 22 | Inferred type from `ToolParamsSchema`. |
| `LifecycleConfigSchema` | `z.ZodObject` | 26–31 | Registry-entry lifecycle: one of `permanent` (default), `rounds`, `time-window`, `session`. |
| `FrequencyConfigSchema` | `z.ZodObject` | 33–38 | Usage-frequency caps: `maxTotal`, `maxPer100`, `maxPer50`, `maxPer25`. |
| `RegistryEntrySchema` | `z.ZodObject` | 40–52 | Prompt registry entry: `type` (custom/hook-output/file/template), `description`, optional content/members/tags/group/priority, lifecycle + frequency. |
| `RegistryEntryInput` | type | 54 | Inferred type from `RegistryEntrySchema`. |
| `ToolHookSchema` | `z.ZodObject` | 58–61 | Per-tool hook arrays: optional `before` and `after` script paths. |
| `HooksConfigSchema` | `z.ZodObject` | 63–68 | Global hooks config: `before_agent`, `after_agent`, per-tool hooks map (`tools`), `timeoutMs`. |
| `HooksConfig` | type | 70 | Inferred type from `HooksConfigSchema`. |
| `ProfileFrontmatterSchema` | `z.ZodObject` | 74–81 | Profile YAML frontmatter: `name`, optional `description`, `tools`, `hooks`, `placeholders`, `registry`. |
| `ProfileFrontmatter` | type | 83 | Inferred type from `ProfileFrontmatterSchema`. |
| `ProfileDefinition` | interface | 85–88 | Runtime profile shape: `readonly frontmatter` + `readonly prompt` string. |
| `ProjectPolicySchema` | `z.ZodObject` | 92–115 | Project-level permission policy: tool/path allow/deny lists, bash command allow/deny, network domain controls, env var allow/deny. |
| `ProjectPolicy` | type | 117 | Inferred type from `ProjectPolicySchema`. |

---

## Notes

- All schemas are built with **Zod** (`z.object`). No runtime parsing is done here — this file only defines shapes.
- `ActionSchema` and `ToolParamsSchema` form the **input contract** for the extension's tool handler.
- `LifecycleConfigSchema` defaults to `{ type: "permanent" }`; all other schemas use `.optional()` for non-required fields.
- No non-exported items; every definition in the file is exported.
