# tests/permission.test.ts (`backend/computation/policy/permission.test.ts`)

## Purpose

Integration and unit tests for the permission enforcement system — validates that `evaluate()` and `executeRun()` (imported from `../../runtime/mod.ts`) correctly allow/block tool calls by tool name and file path, and that the full runtime respects policy decisions.

## Setup / Teardown (lines 10–39)

- Creates a temp sandbox at `/tmp/efficiency-perm-test-{uuid}` with two fixture files (`A.txt`, `B.txt`) and a `restricted-agent` profile.
- Each test gets a fresh sandbox; `afterEach` cleans up and resets prompt-slot engine state.

## Test Suites

### "Policy evaluator — file A allowed, file B blocked" (lines 41–69)

Unit tests exercising `evaluate()` with a policy that grants `read` on `A.txt` only.

| Scenario | Expectation |
|---|---|
| `read A.txt` | `allowed: true` |
| `read B.txt` | `allowed: false`, reason contains `"not allowed"` |
| `write A.txt` | `allowed: false`, reason contains `"not in allowed list"` |
| `read B.txt` with wildcard `paths: ["*"]` | `allowed: true` |

### "Runtime — agent reads A.txt (policy allows)" (lines 71–88)

Integration test through `executeRun()` with a permissive policy (`A.txt` + `file.txt`). Reads durable events via `readEvents(result.runDir)` and verifies the run completes with one `tool_call` event and zero `policy_block` events.

### "Runtime — agent tries B.txt (policy blocks)" (lines 90–107)

Integration test through `executeRun()` with a restrictive policy (`A.txt` only, no wildcard). Reads durable events via `readEvents(result.runDir)` and verifies a single `policy_block` event with `reason` containing `"not allowed"` and zero `tool_call` events.

### "Cross-verification: both files exist on disk" (lines 109–121)

Sanity check that `A.txt` and `B.txt` are both physically present in the sandbox — ensures test failures above are due to policy, not missing fixtures.
