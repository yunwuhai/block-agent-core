# L1 -- `backend/runtime/actions.ts`

**Purpose:** MountController — manages the mutable schedule state at runtime. The LLM calls mount/unmount/view to dynamically adjust which context entries are included in the assembly. Each mutation re-resolves the pipeline. Tracks transient entries for automatic cleanup on unmount. Supports serialization for run continuity.

**Lines:** 720

## Exports

| Export | Kind | Lines | Description |
|---|---|---|---|
| `ResolveFn` | type | 83--88 | Signature of pipeline resolve function, injected via constructor for testability |
| `ScheduleState` | interface | 95--100 | Full controller state snapshot: `request` (ContextRequest) + `assembly` (ContextAssembly) |
| `MountSpec` | interface | 108--123 | What to add to schedule: `capabilities?`, `entryIds?`, `tags?`, `entries?` (transient EntryInputs) |
| `UnmountSpec` | interface | 132--139 | What to remove from schedule: `entryIds?`, `capabilities?`, `tags?` |
| `ViewScope` | type | 148 | `"mounted" \| "available" \| "full"` |
| `ViewResult` | interface | 161--168 | View output: `mounted?` (MountedEntry[]), `available?` (PoolEntry[]), `assembly?` (ContextAssembly) |
| `ProcessAction` | interface | 176--187 | Bridges old action-schema format: `type` ("schedule"/"unschedule") + `capabilities?`/`entryIds?`/`tags?`/`entries?` |
| `MountEvent` | interface | 194--206 | Event emitted after mount: `spec`, `prevRequest`, `newRequest`, `assembly`, `transientIdsAdded?` |
| `UnmountEvent` | interface | 209--222 | Event emitted after unmount: `spec`, `prevRequest`, `newRequest`, `assembly`, `transientIdsRemoved?` |
| `ScheduleEvent` | type | 225 | `MountEvent \| UnmountEvent` |

### `MountController` class

| Method | Lines | Description |
|---|---|---|
| `constructor(registry, capabilityRegistry, pipeline, runContext, frequencyState?, logger?)` | 287--304 | All dependencies injected. Initializes empty request, resolves once so assembly reflects registry's default state. |
| `mount(spec)` | 333--386 | 4 steps: (1) registers transient entries, (2) merges spec into request (concat + dedup via Set), (3) re-resolves pipeline, (4) logs MountEvent. Returns new ContextAssembly. |
| `unmount(spec)` | 415--464 | 4 steps: (1) removes spec fields from request via Set.delete, (2) re-resolves pipeline, (3) cleans up transient entries no longer mounted (removes from registry + tracker), (4) logs UnmountEvent. Returns new ContextAssembly. |
| `view(scope)` | 476--486 | Returns subset of current assembly. `"mounted"` → mounted entries, `"available"` → pool, `"full"` → complete ContextAssembly. |
| `getSchedule()` | 501--503 | Returns current accumulated ContextRequest (snapshot). |
| `setSchedule(request)` | 515--523 | Restores schedule from serialized request. Re-resolves pipeline. |
| `getAssembly()` | 529--531 | Returns current ContextAssembly. |
| `processAction(action)` | 553--584 | Bridges old action-schema: `"schedule"` → mount(), `"unschedule"` → unmount(). Throws on unknown type. |

## Internal

| Symbol | Lines | Description |
|---|---|---|
| `request` | 257 | Current accumulated ContextRequest |
| `assembly` | 260 | Last resolved ContextAssembly |
| `mountTransientIds` | 269 | `Set<string>` — IDs added as transient via mount().entries, tracked for automatic cleanup |
| `mergeRequest(existing, spec)` | 607--651 | Merges MountSpec into ContextRequest: concat + dedup via Set for capabilities/entryIds/tags; preserves budget/pinned/enforceFrequency |
| `reduceRequest(existing, spec)` | 669--718 | Removes UnmountSpec fields from ContextRequest via Set.delete; preserves untouched fields |

## State Transitions

```
mount(spec)
  ├─ entries[] → registry.add(entry, "transient") for each, track IDs
  ├─ merge spec into request.want (concat + dedup)
  ├─ pipeline.resolve(request, registry, context, frequencyState)
  ├─ store assembly
  └─ log MountEvent

unmount(spec)
  ├─ remove matching fields from request (Set.delete)
  ├─ pipeline.resolve(request, registry, context, frequencyState)
  ├─ compare old/new mounted IDs → transient entries no longer mounted → registry.remove(id)
  └─ log UnmountEvent
```

## Edge Cases

| Scenario | Behavior |
|---|---|
| Mount with empty spec | Re-resolves current request (idempotent) |
| Duplicate entries in spec | Dedup via Set |
| Unmount entries not in request | No-op (Set.delete is idempotent) |
| Transient entry unmounted | Removed from registry automatically |
| Mount duplicate transient | `registry.add()` is idempotent |
| Empty registry | Assembly: `mounted=[]`, `pool=[]` |
| Pipeline throws | Error propagates to caller |

## Notes

- **Not thread-safe**: Concurrent callers must provide their own synchronization.
- **Transient cleanup only on unmount**: An entry that was mounted but then excluded by budget in the next resolution is NOT removed — only entries that are no longer mounted AND in `mountTransientIds` are cleaned.
- **Spec capabilities expanded**: `mount()` expands capabilities through the CapabilityRegistry's implies DAG before merging into the request.
