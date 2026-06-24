# L1 — `backend/input/schema.ts`

**Purpose:** Zod schema definitions for the efficiency-subagent input layer. Validates tool invocation params, profile YAML frontmatter, prompt registry entries, and project-level policy. Lifecycle script configuration is no longer part of the profile schema.

## Exports

| Symbol | Kind | Lines | Description |
|---|---|---|---|
| `ActionSchema` | `z.ZodObject` | 5–16 | Single tool action: `toolName` (required) + optional `filePath`, `command`, `url`, `envVar`, `scheduleTags`, `scheduleIds`, `scheduleGroup`, `unscheduleTags`, `unscheduleIds`. |
| `ActionParams` | type | 13 | Inferred type from `ActionSchema`. |
| `ToolParamsSchema` | `z.ZodObject` | 15–20 | Top-level invocation payload: `profile`, `task`, optional `runId` and `actions` array. |
| `ToolParams` | type | 22 | Inferred type from `ToolParamsSchema`. |
| `LifecycleConfigSchema` | `z.ZodObject` | 26–31 | Registry-entry lifecycle: `permanent`, `rounds`, `time-window`, or `session`; defaults to `permanent`. |
| `FrequencyConfigSchema` | `z.ZodObject` | 33–38 | Usage-frequency caps: `maxTotal`, `maxPer100`, `maxPer50`, `maxPer25`. |
| `RegistryEntrySchema` | `z.ZodObject` | 40–52 | Prompt registry entry: `type` (custom/file/template), description, optional content/file/template fields, tags/group/priority, lifecycle, frequency. |
| `RegistryEntryInput` | type | 54 | Inferred type from `RegistryEntrySchema`. |
| `ProfileFrontmatterSchema` | `z.ZodObject` | 58–64 | Profile YAML frontmatter: `name`, optional `description`, `tools`, `placeholders`, `registry`. |
| `ProfileFrontmatter` | type | 66 | Inferred type from `ProfileFrontmatterSchema`. |
| `ProfileDefinition` | interface | 68–71 | Runtime profile shape: `readonly frontmatter` + `readonly prompt` string. |
| `ProjectPolicySchema` | `z.ZodObject` | 75–98 | Project-level permission policy: tool/path allow/deny lists, bash command allow/deny, network domain controls, env var allow/deny. |
| `ProjectPolicy` | type | 100 | Inferred type from `ProjectPolicySchema`. |

## Notes

- `ActionSchema` and `ToolParamsSchema` form the extension tool input contract.
- `ProfileFrontmatterSchema` controls subagent tools, prompt placeholders, and registry entries. It does not accept lifecycle script configuration.
- `RegistryEntrySchema` no longer includes lifecycle-script output entries; inline runtime context should use `custom`.
