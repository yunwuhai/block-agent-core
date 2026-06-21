# tests/permission.test.ts

## Purpose

Integration and unit tests for the permission enforcement system — validates that `evaluate()` and `executeRun()` correctly allow/block tool calls by tool name and file path, and that the full runtime respects policy decisions.

## Setup / Teardown (lines 9–38)

- Creates a temp sandbox at `/tmp/efficiency-perm-test-{uuid}` with two fixture files (`A.txt`, `B.txt`) and a `restricted-agent` profile.
- Each test gets a fresh sandbox; `afterEach` cleans up and resets prompt-slot engine state.

## Test Suites

### "Policy evaluator — file A allowed, file B blocked" (lines 40–68)

Unit tests exercising `evaluate()` with a policy that grants `read` on `A.txt` only.

| Scenario | Expectation |
|---|---|
| `read A.txt` | `allowed: true` |
| `read B.txt` | `allowed: false`, reason contains `"not allowed"` |
| `write A.txt` | `allowed: false`, reason contains `"not in allowed list"` |
| `read B.txt` with wildcard `paths: ["*"]` | `allowed: true` |

### "Runtime — agent reads A.txt (policy allows)" (lines 70–86)

Integration test through `executeRun()` with a permissive policy (`A.txt` + `file.txt`). Verifies the run completes with one `tool_call` event and zero `blocked` events.

### "Runtime — agent tries B.txt (policy blocks)" (lines 88–105)

Integration test through `executeRun()` with a restrictive policy (`A.txt` only, no wildcard). Verifies a single `policy`-type blocked event with `detail` containing `"not allowed"` and zero `tool_call` events.

### "Cross-verification: both files exist on disk" (lines 107–119)

Sanity check that `A.txt` and `B.txt` are both physically present in the sandbox — ensures test failures above are due to policy, not missing fixtures.
