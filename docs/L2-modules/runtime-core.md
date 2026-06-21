# L2 Module: `runtime-core` — Run Orchestration & Tool Simulation

**Purpose:** Central execution lifecycle for subagent runs. This module is the top-level entry point that ties together profile loading, policy enforcement, prompt rendering, hook dispatch, tool simulation, session persistence, transcript generation, and structured handoff output. Split into two focused files after the Phase 3 refactor: a lifecycle orchestrator and a tool execution engine.

**Module type:** Orchestrator — drives and coordinates the other L2 modules.

---

## Member Files

| L1 Doc | Source File | Role |
|--------|-------------|------|
| `runtime-orchestrator.md` | `frontend/operation/orchestrator.ts` | Lifecycle orchestrator (600 lines). Contains `executeRun()` (the single entry point called by the tool handler in `index.ts`), plus all lifecycle-phase helpers: run identity resolution, directory creation, profile loading, policy merge, slot/registry wiring, action loop dispatch, transcript/handoff artifact generation, and teardown persistence. |
| `runtime-tool-simulator.md` | `frontend/operation/tool-simulator.ts` | Tool execution engine (287 lines). Contains `simulateToolInteraction()` (single-tool pipeline with policy evaluation, before/after hooks, simulated call logging), `executeWithRetry()` (exponential backoff wrapper), and `runPhaseHook()` (phase-level hook dispatcher used by both orchestrator and tool simulator). |
| `runtime-mod.md` | `frontend/operation/mod.ts` | Barrel file (4 lines). Re-exports `executeRun`, `RunContext`, `RunResult` from `orchestrator.ts` and `executeWithRetry`, `runPhaseHook`, `simulateToolInteraction`, `PhaseHookOutcome`, `ToolInteractionResult` from `tool-simulator.ts`. |

---

## Per-File Contribution Summary

### `frontend/operation/orchestrator.ts` (runtime-orchestrator.md)

**Exported API:**
- `RunContext` interface — input parameters: `cwd`, `params` (ToolParams), optional `signal`, `timeoutMs`
- `RunResult` interface — return shape: `runId`, `status` (completed/failed/blocked), `handoffPath`, `runDir`, `events`, `output`, optional `transcript`
- `executeRun(ctx): Promise<RunResult>` — primary entry point

**Lifecycle phases orchestrated by `executeRun()`:**
1. Timeout and signal setup
2. Run ID resolution (supports continuation via suffix)
3. Run directory creation + registry init (`RegistryStorage` + `ScheduleOrchestrator`)
4. Session metadata persistence
5. Continuation consistency check (profile drift warning, slot restore)
6. Profile loading
7. Policy merge (project policy → `toPolicyEntry()` → `mergePolicies()`)
8. Phase hooks (`before_agent` — may block and skip agent execution)
9. Placeholder + registry registration from profile frontmatter
10. Prompt build (`renderPromptWithRegistry()`)
11. Action loop (for each action, calls `executeWithRetry()` from `tool-simulator.ts`)
12. Phase hooks (`after_agent`)
13. Transcript build (markdown to `transcript.md`)
14. Handoff generation (structured block with filesTouched, toolSummary, blockContext)
15. Run end events + slot/registry persistence
16. Return `RunResult`

**Key internal helpers:** `createRunTiming`, `resolveRunIdentity`, `initializeRegistry`, `loadMergedPolicy`, `registerProfilePlaceholders`, `registerProfileRegistryEntries`, `executeActionLoop`, `createArtifacts`, `buildRunResult`, `assertRunNotAborted`

### `frontend/operation/tool-simulator.ts` (runtime-tool-simulator.md)

**Exported API:**
- `PhaseHookOutcome` interface — `{allowed: boolean, sessionMessages: HookSessionMessage[]}`
- `ToolInteractionResult` interface — `{output: string, blocked: boolean}`
- `runPhaseHook(hooks, ctx, events)` — phase-level hook dispatcher; selects scripts from `HooksConfig`, calls `runHookScripts()`, registers hook output as slots
- `executeWithRetry(run, ...)` — wraps tool simulation with exponential backoff (up to 2 retries for transient errors)
- `simulateToolInteraction(run, ...)` — single-tool lifecycle: abort check → policy evaluate → `before_tool` hook → simulated call/result → `after_tool` hook → slot mutation logging

**Retry strategy:** Max 2 retries with exponential backoff (1s, 2s). Only retries timeout/network/ECONNREFUSED errors. All other errors propagate immediately.

**Internal helper:** `selectHookScripts(hooks, ctx)` — routes phase + tool name to correct hook script array

### `frontend/operation/mod.ts` (runtime-mod.md)

Pure re-export barrel. No logic. Single import point for top-level orchestration and tool simulation.

---

## Refactor History

Prior to Phase 3, all functionality lived in a single monolithic `runtime/runner.ts` (~965 lines). The refactor split it into:
- `frontend/operation/orchestrator.ts` (600 lines) — lifecycle management, policy merge, artifact generation
- `frontend/operation/tool-simulator.ts` (287 lines) — tool execution, retry logic, hook dispatch

The handoff extraction helpers (`extractFilesTouched`, `mapToolToOperation`, `extractFilePath`, `extractToolSummary`, `extractBlockContext`) were moved to `backend/storage/run-artifacts.ts` where they belong with the handoff generation logic.

---

## Internal Relationships (Data/Call Flow)

```
Callers (index.ts tool handler)
        │
        ▼
  frontend/operation/mod.ts ──(re-exports)──> frontend/operation/orchestrator.ts
        │                                │
        │                    ┌───────────┼───────────┐
        │                    ▼           ▼           ▼
        │             prompt-engine  operation/   policy/
        │             (renderPrompt, tool-simulator (evaluate,
        │              setRegistry,  (runPhaseHook, mergePolicies,
        │              serialize/    executeWithRetry, toPolicyEntry)
        │              deserialize)  simulateToolInteraction)
        │                    │           │
        │                    └─────┬─────┘
        │                          ▼
        │                     registry/
        └────(re-exports)────> frontend/operation/tool-simulator.ts
                                   │
                              ┌────┴────┐
                              ▼         ▼
                         hooks/     policy/
                         (runner,   (evaluate)
                          slot-insertion)
```

**Key flows:**
1. **Startup:** `executeRun()` wires registry → prompt-engine via `setRegistry()`, loads profile, merges policy, runs `before_agent` hooks via `runPhaseHook()` from `tool-simulator.ts`
2. **Per-action loop:** For each action → `executeWithRetry()` → `simulateToolInteraction()` → `evaluate(policy)` → `runPhaseHook(before_tool)` → tool execution → `runPhaseHook(after_tool)` → slot mutation logging
3. **Teardown:** `after_agent` hooks → transcript → handoff via `generateRunArtifacts()` → serialize slots → save registry → return result
4. **Continuation:** Restores prior run identity, deserializes slots from disk, appends continuation suffix to runId

---

## External Dependencies (L1 docs outside this module)

| Dependency | L1 Doc | Used For |
|------------|--------|----------|
| Prompt engine | `runtime-prompt-slots-engine.md` | `setRegistry()`, `renderPromptWithRegistry()`, `serializeSlots()`, `deserializeSlots()`, placeholder/file registration from profile frontmatter |
| Hook system | `runtime-hooks-runner.md`, `runtime-hooks-slot-insertion.md`, `runtime-hooks-types.md` | `runHookScripts()` for phase hook execution; `registerHookOutput()` for slot injection; `HookContext`, `HookResult` types |
| Registry storage | (registry L1 docs) | `RegistryStorage` init, `registerIfNew()` for profile entries |
| Registry orchestration | (registry L1 docs) | `ScheduleOrchestrator` init |
| Policy | (policy L1 docs) | `loadProjectPolicy()`, `mergePolicies()`, `evaluate()` per action |
| Storage | `storage-mod.md`, `storage-run-artifacts.md`, `storage-event-log.md`, `storage-handoff-store.md`, `storage-transcript-projector.md` | `createRunDir()`, session JSON persistence, `generateRunArtifacts()`, `writeHandoff()`, `buildTranscript()` |
| Config types | (config L1 docs) | `ToolParams`, `Profile`, profile loading |
| Display | (display L1 docs) | TUI event formatting |

---

## Physical Location

| Source File | Current Path | Notes |
|------------|-------------|-------|
| `runtime/orchestrator.ts` | `frontend/operation/orchestrator.ts` | Lifecycle orchestrator (600 lines). Created in Phase 3 refactor by splitting the former `runner.ts`, then moved to the 操作 layer in Step 4. |
| `runtime/tool-simulator.ts` | `frontend/operation/tool-simulator.ts` | Tool execution engine (287 lines). Extracted from `runner.ts`, then moved to the 操作 layer in Step 4. |
| `runtime/mod.ts` | `frontend/operation/mod.ts` | Barrel file — re-exports from both orchestrator and tool-simulator. |

> **Step 4 reorganization status: COMPLETE.** The runtime-core module now lives under `frontend/operation/`; backend artifacts live under `backend/storage/` and `backend/output/`.
