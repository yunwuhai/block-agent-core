# policy/evaluator.ts

**Purpose:** Policy evaluation engine that checks an `ActionContext` against a `MergedPolicy` and returns an allow/deny decision. Covers tool name allowlisting, file path matching (with globs and exclusions), bash command filtering, network domain/port/scheme rules, env var allow/deny, and nested subagent gating.

## Exports

| Export | Kind | Lines | Description |
|--------|------|-------|-------------|
| `ActionContext` | interface | 3–12 | Describes the action being checked: `toolName`, `filePath`, `command`, `url`, `port`, `scheme`, `envVar`, `isNestedSubagent` |
| `PolicyDecision` | interface | 14–17 | Result shape: `{ allowed: boolean, reason: string }` |
| `evaluate` | function | 21–98 | Main entry point. Walks through every policy dimension (tools, nesting, paths, bash, network, env, bash-path extraction) and returns `allowed: true` only if all checks pass |

## Internal (unexported)

| Name | Kind | Lines | Description |
|------|------|-------|-------------|
| `SUBAGENT_TOOL_NAME` | const | 19 | Hardcoded tool name `"efficiency_subagent"` used for nested-subagent checks |
| `matchPath` | function | 100–112 | Path glob matching — supports `*`, `**`, prefix, and exact match with directory-boundary guard |
| `matchCommand` | function | 114–129 | Command glob matching; translates `*`/`?` to regex, falls back to exact command name or prefix |
| `PATH_OPS` | const | 136–142 | Set of filesystem-operating commands (`mkdir`, `touch`, `rm`, `mv`, `cp`, etc.) whose path arguments are extracted for path-policy checks |
| `extractBashPaths` | function | 144–173 | Parses a bash command string to extract redirect targets and path arguments, deduped and filtered to candidates for path-policy matching |
| `domainMatch` | function | 175–186 | Matches a URL hostname against a domain pattern (supports `*.` wildcard prefix) |
| `portMatch` | function | 188–196 | Checks whether a URL's port is allowed/denied by the policy's port rules |
| `schemeMatch` | function | 198–205 | Checks whether a URL's protocol scheme is allowed/denied by the policy's scheme rules |
