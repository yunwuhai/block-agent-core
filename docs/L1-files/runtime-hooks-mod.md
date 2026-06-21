# `runtime/hooks/mod.ts` — Hooks barrel

**File purpose:** Barrel module for the hooks subsystem. Re-exports the public API surface — hook script execution, slot injection, and shared types — from the three internal modules.

**Line count:** 4 lines

---

## Exports

| # | Export | Kind | Description | Source | Line |
|---|--------|------|-------------|--------|------|
| 1 | `runHookScripts` | function | Run an ordered list of hook scripts against a `HookContext`. Aggregates slot content, tracks last-modified args, captures session messages, enforces timeouts. Returns `HookResult`. | `./runner.ts:19` | 1 |
| 2 | `injectHookOutputAsSlot` | function | Write hook `slotContent` into the prompt-slot engine under a named slot (`hook_{phase}_{profile}`) with low priority (-10). | `./slot-insertion.ts:7` | 2 |
| 3 | `registerHookOutput` | function | Register hook output as a Prompt Registry entry (type: `hook-output`, lifecycle: session). Falls back to `injectHookOutputAsSlot` if registry is inactive. Returns entry ID or `null`. | `./slot-insertion.ts:33` | _(not re-exported from mod.ts)_ |
| 4 | `HookResult` | type | Result of a hook script execution: `allowed`, `reason`, `slotContent`, `modifiedArgs`, optional `sessionMessage`. | `./types.ts:16` | 3 |
| 5 | `HookContext` | type | Context provided to a hook script: `phase`, `profile`, `task`, `runId`, `cwd`, optional `toolName`/`toolArgs`. | `./types.ts:1` | 3 |
| 6 | `HookPhase` | type | Union of hook lifecycle phases: `before_agent` \| `after_agent` \| `before_tool` \| `after_tool`. | `./slot-insertion.ts:5` | 4 |
