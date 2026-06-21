# policy/mod.ts

**Purpose:** Barrel module for the policy layer. Re-exports the merge, evaluation
functions, and their shared types so consumers import from a single path.

**Exports:**

| Export | Kind | Line | Description |
|---|---|---|---|
| `mergePolicies` | function | 1 | Deep-merge multiple `PolicyEntry` arrays into a single `MergedPolicy` |
| `evaluate` | function | 2 | Evaluate an `ActionContext` against a `MergedPolicy`; returns `PolicyDecision` |
| `PolicyEntry` | type | 3 | Input shape for a single policy rule (allow/deny lists per category) |
| `MergedPolicy` | type | 3 | Result of merging — flattened, deduplicated policy ready for evaluation |
| `ActionContext` | type | 4 | Action to check (tool, file, command, network, env, subagent fields) |
| `PolicyDecision` | type | 4 | Result enum (`allow` / `deny` / `ask`) with optional reason |

**Related:** `policy/merge.ts`, `policy/evaluator.ts`
