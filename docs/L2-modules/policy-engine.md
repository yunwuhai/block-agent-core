# Module: policy-engine

**Purpose:** Permission enforcement engine. Merges multiple policy entries into a unified rule set, then evaluates every tool invocation (tool name, file paths, bash commands, network access, env vars, nested-subagent calls) against that merged policy to produce an allow/deny decision.

## Member Files

| L1 Doc | Source File | Role |
|--------|-------------|------|
| [policy-merge.md](../L1-files/policy-merge.md) | `policy/merge.ts` | Policy composition — unions PolicyEntry arrays into a single MergedPolicy |
| [policy-evaluator.md](../L1-files/policy-evaluator.md) | `policy/evaluator.ts` | Decision engine — checks ActionContext against MergedPolicy across all dimensions |
| [policy-mod.md](../L1-files/policy-mod.md) | `policy/mod.ts` | Barrel — re-exports merge, evaluator, and all shared types from one path |

## Per-File Contribution Summary

### policy/merge.ts
Accepts any number of `PolicyEntry | undefined | null` values and produces a single `MergedPolicy`:
- **Tools, paths, excludePaths**: additive union across all entries (Set-deduplicated)
- **Bash, env**: union of allow/deny arrays; omitted (null) if no entry defines them
- **Network**: allow is OR'd (any entry allowing = allowed); domains/ports/schemes are unioned; omitted if no entry defines a network rule

### policy/evaluator.ts
The main `evaluate()` function walks through every policy dimension:
1. Tool name allowlisting
2. Nested subagent gating (checks if tool is `"efficiency_subagent"`)
3. File path matching with glob support (`*`, `**`) and exclusions
4. Bash command filtering (exact match, prefix, glob→regex)
5. Bash path extraction — parses command strings for redirect targets and path arguments
6. Network domain/port/scheme matching (domain wildcards, port rules, protocol checks)
7. Env var allow/deny

Returns `{ allowed: boolean, reason: string }`. Only returns `allowed: true` when ALL checks pass.

### policy/mod.ts
Thin barrel that re-exports the public API: `mergePolicies`, `evaluate`, `PolicyEntry`, `MergedPolicy`, `ActionContext`, `PolicyDecision`. Consumers import from this single path.

## Internal Relationships

```
policy/merge.ts  ──produces──▶  MergedPolicy  ──consumed by──▶  policy/evaluator.ts
                                                                       │
policy/evaluator.ts ──consumes──▶  MergedPolicy, ActionContext ──returns──▶  PolicyDecision
                                                                       │
                    ┌──────────────────────────────────────────────────┘
                    ▼
              policy/mod.ts  (re-exports all symbols from both)
```

- **merge → evaluator**: Evaluator depends on merge's `MergedPolicy` type. Merge has no dependency on evaluator.
- **mod → both**: Barrel depends on both sub-modules. No circular dependency.

## External Dependencies

### Consumers (who depends on this module)
| L1 Doc | Relationship |
|--------|-------------|
| [runtime-runner.md](../L1-files/runtime-runner.md) | Calls `evaluate()` during subagent execution to enforce permissions on every tool call |
| [index.md](../L1-files/index.md) | Indirect consumer — `executeRun` (imported from runtime) invokes the policy chain |

### Upstream (what this module depends on)
| L1 Doc | Relationship |
|--------|-------------|
| None | Policy engine is self-contained — it operates on its own types (`PolicyEntry`, `ActionContext`) with no imports from other extension modules |

## Physical Location

| Source File | Current Path | Notes |
|------------|-------------|-------|
| `policy/merge.ts` | `policy/merge.ts` | `mergePolicies()` — unions PolicyEntry arrays into MergedPolicy |
| `policy/evaluator.ts` | `policy/evaluator.ts` | `evaluate()` — 7-dimension permission check |
| `policy/mod.ts` | `policy/mod.ts` | Barrel re-exporting all public symbols |

> **Step 4a status: DEFERRED.** Files remain in the legacy `policy/` directory. Planned move to `backend/computation/` not executed.

### Shared Constants
- `SUBAGENT_TOOL_NAME = "efficiency_subagent"` hardcoded in evaluator.ts matches the tool name registered in [index.md](../L1-files/index.md). If the tool name changes in index.ts, this constant must be updated.
