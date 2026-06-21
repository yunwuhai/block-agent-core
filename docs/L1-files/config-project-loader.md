# L1 — `config/project-loader.ts`

## Purpose

Load the project-level policy file (`.pi/efficiency-subagent/config.json`) from disk, parse it, and validate it against the Zod schema. Returns `null` gracefully when the file is missing, unparseable, or fails validation — no policy means "allow all".

Depends on `./schema.ts` for `ProjectPolicySchema` and the `ProjectPolicy` type.

## Exports

| Export | Kind | Lines | Description |
|--------|------|-------|-------------|
| `loadProjectPolicy(cwd: string)` | async function | 13–36 | Reads `{cwd}/.pi/efficiency-subagent/config.json`, parses JSON, validates with `ProjectPolicySchema.safeParse`. Returns `ProjectPolicy \| null`. |

## Behaviour

- **File not found**: catches `readFile` rejection → returns `null`.
- **Invalid JSON**: `JSON.parse` throws → caught → returns `null`.
- **Schema violation**: `safeParse` returns `!success` → returns `null`.
- **Success**: returns the validated `ProjectPolicy` object.

## Dependencies

- `node:fs/promises` — `readFile`
- `node:path` — `join`
- `./schema.ts` — `ProjectPolicySchema`, `ProjectPolicy`
