# L1 -- `backend/runtime/run.ts`

**Purpose:** RunLifecycle — orchestrates a single subagent run from creation (create) or continuation (continue) through to artifact production. Handles run identity generation, profile loading, policy merging, registry registration, action loop execution, and final artifact generation. Heavy-lifting is delegated to the pipeline, composer, policy evaluator, and MountController.

**Lines:** 980

## Exports

| Export | Kind | Lines | Description |
|---|---|---|---|
| `Run` | interface | 98--113 | Run metadata: `id`, `profile`, `task`, `startTime`, `status`, `directory`, `isContinuation`, `request?` |
| `RunConfig` | interface | 77--96 | Input configuration: `profile`, `task`, `cwd`, `actions?`, `request?` (ContextRequest) |
| `RunResult` | interface | 119--129 | Run output: `id`, `status`, `handoffPath`, `transcriptPath`, `output`, `assembly?` |
| `Action` | interface | 135--205 | Action spec: discriminated union of `tool_call` (tool + args), `schedule` (capabilities/entryIds/tags/entries), `unschedule` (capabilities/entryIds/tags) |

### `MountController` interface

| Method | Lines | Description |
|---|---|---|
| `scheduleTags(tags)` | 213--213 | Schedule entries by tag. Returns `{ scheduled, ids }`. |
| `scheduleIds(ids)` | 215--215 | Schedule entries by ID. Returns `{ scheduled }`. |
| `scheduleGroup(group)` | 217--217 | Schedule entries by group. Returns `{ scheduled, ids }`. |
| `unscheduleIds(ids)` | 219--219 | Unschedule entries by ID. Returns `{ removed }`. |
| `unscheduleTags(tags)` | 221--221 | Unschedule entries by tag. Returns `{ removed }`. |
| `clearSchedule()` | 223--223 | Clear the entire schedule state. |
| `getAssembly()` | 225--225 | Get the last resolved ContextAssembly. |
| `getSchedule()` | 226--226 | Get the current ContextRequest. |
| `setSchedule(request)` | 227--227 | Restore a serialized ContextRequest. |

### `RunLifecycle` class

| Method | Lines | Description |
|---|---|---|
| `constructor(registryStore, registry, mountController)` | 235--245 | Injects dependencies. All heavy-lifting delegated. |
| `create(config)` | 248--248 | Full run lifecycle: generate run ID → create run dir → load profile → merge policies → register profile entries + placeholders → resolve initial ContextRequest → compose prompt → execute action loop → produce artifacts → persist → return RunResult. |
| `continue(runId, config)` | 250--250 | Restore prior session, append run_continue event, process new actions, produce updated artifacts. Details in internal methods. |

## Internal

| Symbol | Lines | Description |
|---|---|---|
| `createRunId(profile, task)` | 253--270 | Generates run ID: `{profile}-{taskSlug}-{ISOtimestamp}-{6char-hex}` |
| `resolveRunIdentity()` | 288--340 | Resolves run directory: checks session exists, generates run ID if new |
| `loadProfile()` | 348--370 | Loads `.profiles/<name>.md` YAML frontmatter + prompt |
| `loadMergedPolicy()` | 380--410 | Loads project policy + profile policy, merges |
| `registerProfilePlaceholders()` | 418--440 | Registers `{{name}}` → file content bindings |
| `registerProfileEntries()` | 448--480 | Registers profile frontmatter entries into Registry |
| `executeActionLoop()` | 490--690 | Iterates actions: tool_call → evaluate policy → log; schedule/unschedule → MountController → log |
| `createArtifacts()` | 700--760 | Builds handoff.md and transcript.md via output formatters |
| `persistState()` | 770--800 | Saves registry + slots + schedule state to disk |

## Lifetime Flow

```
create(config)
  ├─ createRunId()                   → "worker-refactor-20260623T120000Z-a1b2c3"
  ├─ resolveRunIdentity()            → RunDirectory
  ├─ loadProfile(cwd, profileName)   → ProfileDefinition
  ├─ loadMergedPolicy(cwd, profile)  → Policy
  ├─ registerProfilePlaceholders()   → {{name}} bindings in engine
  ├─ registerProfileEntries()        → entries in Registry
  ├─ mountController.mount(request)  → ContextAssembly
  ├─ composePrompt(assembly, prompt) → FinalPrompt
  ├─ executeActionLoop(actions)      → events[]
  ├─ createArtifacts(run, events)    → handoff.md + transcript.md
  ├─ persistState()                  → registry.jsonl + slots.json
  └─ return RunResult
```

## Notes

- **Thin orchestrator**: RunLifecycle coordinates; all domain logic is in core/pipeline, core/composer, policy/evaluator, and runtime/actions.
- **Continue mode**: When `runId` matches an existing directory, restores session state, adds `run_continue` event, checks `profile_mismatch`.
- **Action loop**: Defaults to no-op if no actions provided. Each action is policy-checked before simulation/recording.
- **Single-threaded**: The class is not safe for concurrent invocation on the same run ID.
