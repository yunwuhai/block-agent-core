# L1: `tests/policy.test.ts`

**Purpose:** Full-coverage test suite for the policy module — exercises `mergePolicies()` composition and `evaluate()` decision engine across every policy dimension: tools, paths, bash commands, network domains, env vars, nested subagent gating, bash path extraction, and exclude paths.

---

## Test Suites

### `describe("Policy merge")` — lines 6–22

Tests for `mergePolicies()`:

| Test | Line | Scenario |
|------|------|----------|
| merges multiple policy layers | 7 | Unions `tools` arrays and `paths` from two partial entries |
| returns null fields for empty input | 17 | No args → all nullable fields are `null` |

### `describe("Policy evaluator")` — lines 24–138

Tests for `evaluate()` against a `MergedPolicy`. The shared fixture (lines 25–31) configures: tools `["read", "bash", "efficiency_subagent"]`, paths `["src/**", "README.md"]`, bash `deny: ["rm", "sudo"]` / `allow: ["git"]`, network `allow: false` with `allowedDomains: ["api.example.com"]` / `deniedDomains: ["evil.com"]`, env `deny: ["SECRET_KEY"]`.

| Test | Line | Scenario |
|------|------|----------|
| allows tool in list | 33 | `toolName: "read"` → `allowed: true` |
| blocks tool not in list | 38 | `toolName: "delete"` → `allowed: false`, reason contains "not in allowed list" |
| allows file in path | 44 | `filePath: "src/foo.ts"` matches `src/**` |
| blocks file not in path | 49 | `filePath: "secret.env"` matches no path glob |
| denies rm command | 55 | `command: "rm -rf /"` matches bash deny list |
| allows git command in allowlist | 61 | `command: "git status"` matches bash allow list |
| blocks network to unauthorized domain | 66 | URL `evil.com` matches deniedDomains |
| allows network to allowed domain | 71 | URL `api.example.com` matches allowedDomains |
| blocks denied env var | 76 | `envVar: "SECRET_KEY"` matches env deny list |
| blocks nested subagent calls | 82 | `isNestedSubagent: true` with tool `efficiency_subagent` → blocked even though tool is in list |
| allows everything when no policy | 93 | Null policy → `allowed: true` unconditionally |
| extracts mkdir paths | 98 | `mkdir novel-writer/test` → path check against `novel-writer/**` |
| extracts mv paths | 104 | `mv old new` → both paths checked against policy |
| extracts touch paths | 109 | `touch foo.txt` → path check against `foo.txt` |
| extracts cp paths | 114 | `cp src/file dest/` → both paths checked |
| blocks bash path via excludePaths | 119 | `mkdir excluded-dir` denied when path is in both `paths` and `excludePaths` (deny wins) |
| skips path extraction for flag-only commands | 126 | `echo -n` — no paths to extract, passes |
| extracts redirect target paths | 131 | `echo>/tmp/out.txt` — redirect target extracted and checked against path policy |
