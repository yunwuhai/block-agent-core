# `registry/orchestration.ts` — Layer 3: Schedule Orchestration Engine

**File purpose:** Mutable scheduling layer that the LLM drives via tool calls. Maintains per-round `ScheduleState` (four sets: `tags`, `ids`, `groups`, `templates`) and exposes atomic schedule/unschedule/query operations for the PI agent to call during conversation.

**Depends on:** `./types.ts` (RegistryEntry, ScheduleState, RunContext, ResolvedEntry), `./storage.ts` (RegistryStorage), `./resolution.ts` (resolveScheduled).

---

## Export: `class ScheduleOrchestrator` (L34–260)

Central mutable schedule manager for a single round. No default export; named import only.

### Constructor & Lifecycle

| Method | Lines | Description |
|---|---|---|
| `constructor(storage: RegistryStorage)` | 43–45 | Stores the storage reference; initialises empty sets for ids, tags, groups, templates. |
| `setLifecycleMap(map: ReadonlyMap<string, number>)` | 48–50 | Injects round-start lifecycle mapping used to evaluate "rounds"-type expiry. Must be called before scheduling if round-based filtering is needed. |

### Schedule Operations (LLM-callable tools)

| Method | Lines | Description |
|---|---|---|
| `scheduleTags(tags: readonly string[])` → `{scheduled, ids}` | 60–72 | Finds all entries matching any of the given tags via `storage.findByTags` and adds their IDs to the schedule. Returns count of newly added IDs and the list of IDs added. |
| `scheduleIds(ids: readonly string[])` → `{scheduled}` | 78–87 | Adds specific entry IDs by direct lookup. Silently skips non-existent or already-scheduled IDs. |
| `scheduleGroup(group: string)` → `{scheduled, ids}` | 93–103 | Adds all entries belonging to a group via `storage.findByGroup`. Tracks the group name for listScheduled display. |
| `scheduleTemplate(templateId: string)` → `{scheduled, ids?}` | 109–119 | Registers a template entry (type === "template") for expansion at resolution time. The template ID is stored in a separate `templates` set (not merged into `ids`). Returns `memberIds` if the template declares them. |

### Unschedule Operations

| Method | Lines | Description |
|---|---|---|
| `unscheduleTags(tags: readonly string[])` → `{removed}` | 130–149 | Removes all entries matching the given tags from the schedule by ID, and removes those tags from the tag tracking set. |
| `unscheduleIds(ids: readonly string[])` → `{removed}` | 154–160 | Removes specific entry IDs from the schedule. Returns count of actually-removed entries. |

### Query Operations

| Method | Lines | Description |
|---|---|---|
| `listScheduled()` → `{tags, ids, groups, templates, count}` | 169–197 | Returns a full summary of the current schedule: all tracked tags/ids/groups/templates plus a deduplicated count of all unique entry IDs across all sources. |
| `listAvailable(runCtx?: RunContext)` → `Array<{id, type, tags, group?, description}>` | 203–225 | Returns all entries from storage as raw data for ToC table generation. Each entry exposes id, type, tags, optional group, and description. |

### State Management

| Method | Lines | Description |
|---|---|---|
| `clearSchedule()` | 232–237 | Clears all four tracking sets. Call at the end of each round to reset for the next. |
| `getSchedule()` → `ScheduleState` | 240–247 | Exports a snapshot of the current schedule as a `ScheduleState` object (copies of all four sets) for Layer 2 resolution consumption. |

### Resolution

| Method | Lines | Description |
|---|---|---|
| `async resolveForMessage(runCtx: RunContext)` → `Promise<ResolvedEntry[]>` | 257–260 | Entry point for the composer (called before message send). Gets the current schedule snapshot and delegates to Layer 2's `resolveScheduled()` for dedup, lifecycle filtering, frequency capping, and sorting. |
