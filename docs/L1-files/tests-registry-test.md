# L1: `tests/registry.test.ts`

## Purpose

Integration and unit test suite for the Prompt Registry system (storage, resolution, orchestration, and message composition). Validates the four-layer architecture end-to-end and in isolation.

## Test Suites

| Line | Suite | Focus |
|------|-------|-------|
| 47–218 | **RegistryStorage** | CRUD operations: register, get, getByName, unregister, findByTags (union/intersection), findByGroup, addTag/removeTag, update, list with filters. Each test uses an isolated temp directory. |
| 224–263 | **Call History & Frequency** | Sliding-window call counters: recordCall, getTotalCalls, getFrequency, getCallHistory persisted via JSONL. |
| 269–427 | **Resolution Engine** | Lifecycle evaluation (`isActive` for permanent/rounds/time-window), frequency capping (`exceedsFrequency`), template expansion (`expandTemplate` with cycle detection), and `resolveScheduled` (deduplication, priority sorting, lifecycle/frequency filters). |
| 433–528 | **ScheduleOrchestrator** | Schedule management: scheduleTags/scheduleIds/scheduleGroup/scheduleTemplate, unschedule ops, listScheduled, listAvailable, clearSchedule, and `resolveForMessage`. |
| 534–627 | **Message Composer** | `buildToCTable` (markdown ToC generation), `composeMessage` (three-section output: ToC + injected + resolved placeholders), call-history recording during compose, unregistered placeholder passthrough. |
| 633–758 | **End-to-end Registry flow** | Full integration: register → schedule → resolve → compose with Korean-language prompt, template expansion end-to-end, and file-backed placeholder resolution via `{{name}}` bindings. |

## Key Patterns

- Each suite creates a fresh `RegistryStorage` in `fs.mkdtemp`-style temp dir, cleaned in `afterEach`.
- Tests use `makeRunCtx()` helper for lightweight `RunContext` objects.
- Async operations (`recordCall`, `resolveScheduled`, `composeMessage`) are awaited throughout.
- Edge coverage includes: idempotent tag ops, self-referencing template cycles, expired time-windows, frequency caps, and unregistered placeholder passthrough.
