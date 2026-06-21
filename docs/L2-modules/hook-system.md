# L2 Module: `hook-system` — Hook Lifecycle Management

**Purpose:** Complete subsystem for user-defined hook scripts that execute at four lifecycle points: `before_agent`, `after_agent`, `before_tool`, `after_tool`. Provides type definitions, safe script execution with timeout guards, and two output injection strategies (lightweight slot-setter and full registry-backed entry) that bridge hook results into the prompt-engine module. Any hook can veto the operation by returning `allowed: false`.

**Module type:** Subsystem — self-contained with its own types, runner, injection bridge, and barrel; depends on `prompt-engine` for output delivery.

---

## Member Files

| L1 Doc | Source File | Role |
|--------|-------------|------|
| `runtime-hooks-types.md` | `runtime/hooks/types.ts` | Pure type definitions: `HookContext` (input), `HookResult` (output contract), `HookSessionMessage` (transcript message shape). Zero runtime logic. |
| `runtime-hooks-runner.md` | `runtime/hooks/runner.ts` | Script executor: validates script names against path-traversal regex, dynamic-imports hook modules from `hooks/scripts/`, runs them sequentially, aggregates results. Enforces per-hook timeouts. |
| `runtime-hooks-slot-insertion.md` | `runtime/hooks/slot-insertion.ts` | Output bridge: two strategies to write hook output into the prompt-engine. Defines the `HookPhase` union type. |
| `runtime-hooks-mod.md` | `runtime/hooks/mod.ts` | Barrel (4 lines): re-exports `runHookScripts`, `injectHookOutputAsSlot`, `registerHookOutput`, `HookResult`, `HookContext`, `HookPhase`. |

---

## Per-File Contribution Summary

### `runtime/hooks/types.ts` (runtime-hooks-types.md)

**All three types are foundational — every other file in this module consumes them:**

| Type | Fields | Purpose |
|------|--------|---------|
| `HookContext` | `phase`, `profile`, `task`, `runId`, `cwd`, optional `toolName`, `toolArgs` | Readonly snapshot passed to every hook invocation |
| `HookResult` | `allowed`, `reason?`, `slotContent?`, `modifiedArgs?`, `sessionMessage?` | Contract every hook script must return. `allowed: false` blocks execution. |
| `HookSessionMessage` | `role` (`"user"` \| `"assistant"`), `content` | Single message appended to the session transcript |

### `runtime/hooks/runner.ts` (runtime-hooks-runner.md)

**Sole exported function: `runHookScripts(scripts, ctx, timeoutMs?)`**

- Iterates over script names (without `.ts` extension)
- For each: validates against `SAFE_SCRIPT_NAME_RE` (`/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/`) to block path traversal
- Resolves to `hooks/scripts/<name>.ts` under project root
- Dynamic-imports and calls default export with `ctx`
- Aggregates `slotContent` (concatenated with `\n\n`), `modifiedArgs` (last writer wins), `sessionMessage` (last writer wins)
- On timeout (`Promise.race` against `timeoutPromise`), rejection, or `allowed: false` → short-circuits with failure `HookResult`

**Internal helpers:** `timeoutPromise(ms)` — returns a rejecting promise for per-hook deadline enforcement.

**Constants:**
- `PLUGIN_DIR` — project root (resolved 2 levels up)
- `HOOKS_DIR` — `hooks/scripts/` directory
- `SAFE_SCRIPT_NAME_RE` — path-safe name validator

### `runtime/hooks/slot-insertion.ts` (runtime-hooks-slot-insertion.md)

**Two injection strategies, plus the `HookPhase` type:**

| Export | Strategy | Behavior |
|--------|----------|----------|
| `HookPhase` (type) | — | Union: `"before_agent"` \| `"after_agent"` \| `"before_tool"` \| `"after_tool"` |
| `injectHookOutputAsSlot(phase, result, profileName)` | Lightweight | Calls `setSlot("hook_{phase}_{profile}", content, -10)` directly in prompt-engine. Fire-and-forget. Skips if `result.slotContent` is empty. |
| `registerHookOutput(result, ctx)` | Registry-backed | Full path: (1) falls back to `injectHookOutputAsSlot()` if registry/orchestrator inactive, (2) registers a `type: "hook-output"` Registry entry with auto-derived tags, (3) assigns `lifecycle: session`, (4) calls `orchestrator.scheduleIds([id])` for next-message scheduling. Returns entry ID or `null`. |

### `runtime/hooks/mod.ts` (runtime-hooks-mod.md)

Barrel: re-exports the five public symbols from the three internal modules. Note: `registerHookOutput` is re-exported from `slot-insertion.ts` line 33 but is listed in `mod.ts` exports alongside `injectHookOutputAsSlot`.

---

## Internal Relationships (Data/Call Flow)

```
                 types.ts (HookContext, HookResult, HookSessionMessage)
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
   runner.ts               slot-insertion.ts
   runHookScripts()        injectHookOutputAsSlot()
        │                  registerHookOutput()
        │                       │
        │  produces HookResult   │  consumes HookResult.slotContent
        │  (slotContent)         │  writes to →
        └───────┬───────────────┘
                ▼
         prompt-engine (setSlot, registry.register, orchestrator.scheduleIds)
```

**Key flows:**
1. **Type layer:** `types.ts` defines the data contracts; every other file imports from it
2. **Execution:** `runner.ts` dynamic-imports hook scripts from `hooks/scripts/`, passes `HookContext`, receives `HookResult`
3. **Injection:** `slot-insertion.ts` takes the `HookResult` (with aggregated `slotContent`) and writes it into `prompt-engine` either directly (`setSlot`) or via registry scheduling
4. **Barrel:** `mod.ts` provides a single import point for the entire subsystem

**Coupling notes:**
- `runner.ts` → depends on `types.ts` (types only)
- `slot-insertion.ts` → depends on `types.ts` (types) + `prompt-engine` (runtime dependency for `setSlot`, registry access)
- `mod.ts` → depends on all three (re-exports)
- Neither `runner.ts` nor `slot-insertion.ts` call each other directly — they are composed by the caller (`runtime-core`'s `runPhaseHook()`)

---

## External Dependencies (L1 docs outside this module)

| Dependency | L1 Doc | Used By | Used For |
|------------|--------|---------|----------|
| Prompt engine | `runtime-prompt-slots-engine.md` | `slot-insertion.ts` | `setSlot()` for direct slot injection; `getRegistry()`, `getOrchestrator()` for registry-backed injection |
| Registry storage | (registry L1 docs) | `slot-insertion.ts` | `RegistryStorage.register()` for hook-output entries |
| Registry orchestration | (registry L1 docs) | `slot-insertion.ts` | `ScheduleOrchestrator.scheduleIds()` for next-message auto-scheduling |
| Hook scripts directory | `hooks/scripts/*.ts` | `runner.ts` | Dynamic-imported hook modules (not an L1 doc — user-authored scripts on disk) |
| Node.js `path` | — | `runner.ts` | `resolve`, `__dirname` for path construction |

## Physical Location

| Source File | Current Path | Notes |
|------------|-------------|-------|
| `runtime/hooks/types.ts` | `runtime/hooks/types.ts` | `HookContext`, `HookResult`, `HookSessionMessage` type definitions |
| `runtime/hooks/runner.ts` | `runtime/hooks/runner.ts` | `runHookScripts()` — safe script execution with timeout guards |
| `runtime/hooks/slot-insertion.ts` | `runtime/hooks/slot-insertion.ts` | `injectHookOutputAsSlot()`, `registerHookOutput()` output bridges |
| `runtime/hooks/mod.ts` | `runtime/hooks/mod.ts` | Barrel re-exporting all public symbols |

> **Step 4a status: DEFERRED.** Files remain in the legacy `runtime/hooks/` directory. Planned move to `backend/computation/` not executed. Note: `runtime/runner.ts` (runtime-core) was NOT split, so the hook-system output bridges still depend on prompt-engine via the monolithic orchestrator.
