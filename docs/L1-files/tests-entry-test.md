# L1 -- `backend/entry/entry.test.ts`

**Purpose:** Integration tests for the entry point — covers executeRun create flow, continuation flow, error handling, MountControllerAdapter schedule/unschedule operations, and module re-export smoke checks. Uses temporary directories with `.profiles/` fixtures.

**Lines:** 272

## Test Structure

| Describe block | Tests | Lines | Coverage |
|---|---|---|---|
| `executeRun — create` | 3 | 42--86 | Basic profile+task run returns RunResult; creates artifacts on disk; generates correct run ID format |
| `executeRun — continuation` | 2 | 88--130 | Continues existing run by runId; continuation has run_continue event |
| `executeRun — error handling` | 2 | 132--168 | Missing profile returns error; invalid profile format handled gracefully |
| `MountControllerAdapter — schedule` | 3 | 170--210 | scheduleTags adds entries; scheduleIds adds specific entries; scheduleGroup adds group entries |
| `MountControllerAdapter — unschedule` | 2 | 212--240 | unscheduleIds removes entries; unscheduleTags removes tag entries |
| `Module re-exports` | 4 | 242--270 | Registry is exported; resolve is exported; compose is exported; CapabilityRegistry is exported |

## Fixtures

| Fixture | Set up in | Description |
|---|---|---|
| `TMP` directory | beforeEach (line 28) | `/tmp/efficiency-subagent-entry-test-{uuid}` — created with `.profiles/` and test profile |
| `PROFILE_CONTENT` | module-level (line 20) | Inline profile with YAML frontmatter (name, description) and body template |
| Profile cleanup | afterEach (line 33) | `rmSync(TMP, { recursive: true })` + `reset()` prompt engine |

## Notes

- Uses `bun:test` framework with `describe`/`it`/`expect`/`beforeEach`/`afterEach`.
- Temporary directories use `randomUUID().slice(0, 8)` suffix to avoid collisions.
- `reset()` is called in `afterEach` to clear the prompt engine's module-level mutable state between tests.
- Tests verify artifact existence (`handoffPath`, `transcriptPath`) and structure (handoff contains YAML frontmatter, context assembly summary).
