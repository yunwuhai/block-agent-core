# L1: `policy/merge.ts`

**Purpose:** Policy composition — merges multiple permission entries into a single unified `MergedPolicy`. Arrays are unioned (Set-deduplicated), network `allow` uses OR semantics, and null/undefined entries are silently skipped. Implements the composition strategy invoked by the policy evaluator.

---

## Exported Symbols

### `PathRule` (line 1–4)
Interface for a path-based access rule. `tools` constrains allowed tool names; `paths` constrains allowed file paths.

### `BashRule` (line 6–9)
Interface for a bash command access rule. `allow`/`deny` lists of command globs to permit or block.

### `NetworkRule` (line 11–19)
Interface for a network access rule. `allow` (boolean), plus granular lists for domains, ports, and schemes — each with allow and deny sides.

### `EnvRule` (line 21–24)
Interface for an environment variable access rule. `allow`/`deny` lists of env var names.

### `PolicyEntry` (line 26–33)
Aggregate interface for a single policy entry — combines optional `tools`, `paths`, `excludePaths`, `bash`, `network`, and `env` sub-rules.

### `MergedPolicy` (line 35–42)
The result type after merging. All fields are nullable; absent rules produce `null`. `excludePaths` is optional.

### `mergePolicies(...policies): MergedPolicy` (line 44–100)
Main merge function. Accepts any number of `PolicyEntry | undefined | null`. Returns a single `MergedPolicy`:
- `tools`, `paths`, `excludePaths`: additive union across all entries.
- `bash`, `env`: union of `allow`/`deny` arrays; omitted if no entry defines them.
- `network`: `allow` is OR'd (any entry allowing = allowed); domains/ports/schemes are unioned; omitted if no entry defines a network rule.
- `excludePaths` is omitted entirely when absent, preserving `exactOptionalPropertyTypes`.
