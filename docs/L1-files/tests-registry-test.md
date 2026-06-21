# L1 — `backend/computation/registry/registry.test.ts`

**Purpose:** Unit and integration tests for Prompt Registry storage, resolution, orchestration, and message composition.

## Suites

| Lines | Suite | Focus |
|---|---|---|
| 47–218 | `RegistryStorage` | CRUD, indexes, tag/group lookup, updates, list filtering. |
| 224–263 | `Call History & Frequency` | JSONL call records and sliding-window counters. |
| 269–427 | `Resolution Engine` | Lifecycle checks, awaited frequency cap call recording, template expansion, deduplication, priority sort. |
| 433–528 | `ScheduleOrchestrator` | Schedule/unschedule/list/resolve APIs. |
| 534–627 | `Message Composer` | ToC generation, compose output, call-history recording, placeholder passthrough. |
| 633–758 | `End-to-end Registry flow` | Register → schedule → resolve → compose, template expansion, file-backed placeholders. |

## Notes

- Inline runtime observations now use `type: "custom"` and `createdBy: "system"`.
- The registry no longer has a lifecycle-script output entry type.
