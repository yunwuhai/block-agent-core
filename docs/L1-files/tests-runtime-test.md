# tests/runtime.test.ts — L1: Runtime Runner Test Suite

**File:** `tests/runtime.test.ts` (113 lines)

## Purpose

Integration tests for the runtime runner (`executeRun` in `runtime/runner.ts`) — the core orchestration function that drives profile+task execution, permission enforcement, action sequences, and prompt-slot persistence.

## Test Setup

- **Tmp dir:** `/tmp/efficiency-subagent-<random>` created per-run, destroyed in `afterEach`.
- **Test profile:** Writes a minimal `.profiles/test-profile.md` so `executeRun` can resolve a profile.
- **Cleanup:** Tears down tmp dir and resets the prompt-slot engine singleton via `reset()` after each test.

## Test Suite: `Runtime runner` (line 26–113)

| # | Test (line) | Scenario |
|---|-------------|----------|
| 1 | **executes a profile+task run and creates artifacts** (27–40) | Smoke test: runs `executeRun` with `test-profile` / `"verify smoke test"`. Asserts `status === "completed"`, a truthy `runId`, `handoffPath` contains `"handoff.md"`, `events` non-empty, and exactly one `run_start` event. |
| 2 | **blocks a tool call when policy denies it** (42–58) | Creates per-project policy config (`config.json`) restricting paths to `/nonexistent-allow/**` and tools to `["nosuch"]`. Executes a run and asserts at least one event has `status === "blocked"`. |
| 3 | **executes multi-action sequence from actions array** (60–77) | Passes an `actions` array (mkdir + write) into `executeRun` params. Expects `"completed"` status and exactly 2 `tool_call` events. |
| 4 | **persists and restores slots across continuation runs** (79–112) | End-to-end round-trip: sets a slot via `setSlot("test-slot-x", …)`, serializes to `slots.json`, resets the engine, then deserializes and verifies the slot content is fully restored. Exercises `serializeSlots` / `deserializeSlots` and the disk-persistence contract. |

## Coverage

- Runtime runner happy path
- Permission policy enforcement (tool/name blocking)
- Multi-action orchestration
- Slot serialization round-trip for continuation runs
- Temp directory bootstrapping and cleanup isolation
