# L1 — `frontend/operation/runtime.test.ts`

**Lines:** 117

## Purpose

Integration tests for the runtime runner (`executeRun` in `frontend/operation/orchestrator.ts`) — the core orchestration function that drives profile+task execution, permission enforcement, action sequences, durable event logging, and prompt-slot persistence.

## Test Setup

- **Tmp dir:** `/tmp/efficiency-subagent-<random>` created per-run, destroyed in `afterEach`.
- **Test profile:** Writes a minimal `.profiles/test-profile.md` so `executeRun` can resolve a profile.
- **Cleanup:** Tears down tmp dir and resets the prompt-slot engine singleton via `reset()` after each test.

## Test Suite: `Runtime runner` (lines 27–117)

| # | Test (line) | Scenario |
|---|-------------|----------|
| 1 | **executes a profile+task run and creates artifacts** (28–42) | Smoke test: runs `executeRun` with `test-profile` / `"verify smoke test"`. Asserts `status === "completed"`, a truthy `runId`, `handoffPath` contains `"handoff.md"`, durable events are non-empty, and exactly one `run_start` event was persisted. |
| 2 | **blocks a tool call when policy denies it** (44–61) | Creates per-project policy config (`config.json`) restricting paths to `/nonexistent-allow/**` and tools to `["nosuch"]`. Executes a run and asserts at least one durable `policy_block` event. |
| 3 | **executes multi-action sequence from actions array** (63–81) | Passes an `actions` array (mkdir + write) into `executeRun` params. Expects `"completed"` status and exactly 2 durable `tool_call` events. |
| 4 | **persists and restores slots across continuation runs** (83–116) | End-to-end round-trip: sets a slot via `setSlot("test-slot-x", …)`, serializes to `slots.json`, resets the engine, then deserializes and verifies the slot content is fully restored. Exercises `serializeSlots` / `deserializeSlots` and the disk-persistence contract. |

## Coverage

- Runtime runner happy path
- Permission policy enforcement (tool/name blocking)
- Multi-action orchestration
- Durable event-log assertions via `readEvents()`
- Slot serialization round-trip for continuation runs
- Temp directory bootstrapping and cleanup isolation
