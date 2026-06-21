# L2 Module: Project Policy

**Purpose:** Load and validate the project-level security/policy configuration from `.pi/efficiency-subagent/config.json` — defines tool allow/deny lists, path restrictions, bash command controls, network domain rules, and environment variable access for the subagent sandbox.

## Member Files

| L1 Doc | Summary |
|--------|---------|
| `config-project-loader.md` | Single async function `loadProjectPolicy(cwd)` — reads `.pi/efficiency-subagent/config.json`, parses JSON, validates against `ProjectPolicySchema`, returns `ProjectPolicy` on success or `null` for missing/invalid config (null = "allow all"). |

## Intra-Module Relationships

- Single-file module. Self-contained policy loading with graceful degradation: file-not-found, invalid JSON, and schema violations all return `null` rather than throwing.

## External Dependencies

| Depends on (L1 doc) | How used |
|---------------------|----------|
| `config-schema.md` | Imports `ProjectPolicySchema` (for `safeParse` validation) and the `ProjectPolicy` type (for the return type). |

## Physical Location

| Source File | Current Path | Notes |
|------------|-------------|-------|
| `config/project-loader.ts` | `backend/input/project-loader.ts` | `loadProjectPolicy(cwd)` — reads `.pi/efficiency-subagent/config.json` |

> **Step 4 reorganization status: COMPLETE.** Project-policy loading now lives in the Backend 输入 layer under `backend/input/`.

## Notes

- The "no policy → allow all" behavior makes project policy entirely opt-in at the project level.
- `ProjectPolicySchema` covers: tool name allow/deny, file path allow/deny, bash command allow/deny, network domain allow/deny, env var allow/deny.
- The `backend/input/mod.ts` barrel (`config-mod.md`) re-exports `loadProjectPolicy`.
