# L1: `runtime/orchestrator.ts` — Run Lifecycle Orchestrator

**File purpose:** Top-level run lifecycle orchestrator for the efficiency-subagent. Drives the full execution flow from startup through teardown: run identity resolution, directory creation, session persistence, profile loading, policy merge, hook dispatch (before/after agent phases), prompt rendering via the registry/slot engine, per-action loop execution, transcript generation, handoff artifact production, and slot/registry persistence. The `executeRun()` function is the single entry point called by the tool handler via `runtime/mod.ts`.

**Imports from:** `storage/`, `config/`, `registry/`, `policy/`, `display/`, `runtime/prompt-slots/engine.ts`, `runtime/tool-simulator.ts`, and Node `node:fs/promises`, `node:path`.

**Lines:** 600 (split from the former monolithic `runner.ts` as part of Phase 3 refactor)

---

## Exports (3)

| Export | Kind | Lines | Description |
|--------|------|-------|-------------|
| `RunContext` | `interface` | 47–52 | Input parameters: `cwd`, `params` (ToolParams), optional `signal` (AbortSignal) and `timeoutMs`. |
| `RunResult` | `interface` | 54–62 | Return shape: `runId`, `status` (completed/failed/blocked), `handoffPath`, `runDir`, `events`, `output`, optional `transcript`. |
| `executeRun` | `async function` | 90–103 | **Primary entry point.** Sets up timeout/signal, delegates to `executeRunWithSignal`, clears timeout in `finally`. |

---

## `executeRun()` — Lifecycle Phases

Inside `executeRunWithSignal()` (lines 105–190), the orchestrator proceeds through these ordered stages:

1. **Run identity resolution** (line 111) — Calls `resolveRunIdentity()`. If `runId` provided and session exists, appends `-cont<timestamp>` suffix for continuation.
2. **Run directory creation** (line 112) — `createRunDir()` allocates the run directory under `.pi/subagents/runs/`.
3. **Registry initialization** (line 113) — Creates `RegistryStorage`, loads existing entries, wires `ScheduleOrchestrator`, sets them as the global registry via `setRegistry()`.
4. **Session metadata** (lines 115–117) — Writes running session state JSON; appends `run_created` or `run_continue` event.
5. **Continuation checks** (lines 118–119) — Records profile mismatch if continuation uses a different profile than the original run; restores serialized slots from `slots.json` on continuation.
6. **Profile loading** (line 120) — `loadProfile()`; throws if the named profile does not exist.
7. **Policy merge** (line 123) — Loads project policy, converts via `toPolicyEntry()`, merges with profile-defined tool permissions via `mergePolicies()`.
8. **Before-agent hooks** (lines 133–138) — Dispatches `runPhaseHook()` for the `before_agent` phase. Blocked hooks set status to `"blocked"` and skip the agent execution loop.
9. **Placeholder + registry registration** (lines 140–141) — Registers `{{name}}` placeholder file mappings and profile frontmatter registry entries.
10. **Prompt rendering** (line 144) — `renderPromptWithRegistry()` produces the full composed prompt; appended as a user-role session message.
11. **Action loop** (lines 156–171) — For each action in `ToolParams.actions` (defaults to one `read`), calls `executeWithRetry()` from `tool-simulator.ts`. Aborts, blocks, or failures set status accordingly.
12. **After-agent hooks** (lines 175–179) — Runs after the action loop completes; may flip status to `"blocked"`.
13. **Artifact generation** (line 181) — Calls `createArtifacts()` which builds handoff block, transcript, filesTouched, toolSummary, and blockContext via `generateRunArtifacts()`.
14. **Run end events** (lines 182–187) — Pushes artifact display events, appends `run_end` event, writes final session state, serializes slots, persists registry.
15. **Return** (line 189) — `buildRunResult()` assembles `RunResult` with status, events, handoff path, and optional transcript.

---

## Internal Functions (not exported)

| Function | Lines | Description |
|----------|-------|-------------|
| `executeRunWithSignal(ctx, signal)` | 105–190 | Core orchestration logic; called by `executeRun()` inside try/finally. |
| `createRunTiming(ctx)` | 192–211 | Builds AbortController with timeout (default 5min); merges user-provided AbortSignal. |
| `resolveRunIdentity(ctx)` | 213–219 | Resolves baseRunId from params or generates new; detects continuation by session existence. |
| `initializeRegistry(cwd, run)` | 221–229 | Creates and loads RegistryStorage; wires ScheduleOrchestrator; sets global registry. |
| `writeRunningSessionState(run, runId, params)` | 231–243 | Persists initial session state JSON (`running` status with profile/task metadata). |
| `appendRunCreatedEvent(run, identity)` | 245–252 | Logs `run_created` or `run_continue` event based on continuation flag. |
| `recordProfileMismatch(ctx, run, identity, events)` | 254–279 | On continuation, warns if the current profile differs from the original run's profile. |
| `restoreSlotsOnContinuation(run, isContinuation, events)` | 281–297 | Deserializes `slots.json` from run directory on continuation; logs restored slot count. |
| `loadRunProfile(ctx)` | 299–306 | Loads profile definition; wraps errors with profile name for clarity. |
| `loadMergedPolicy(ctx, profile)` | 308–319 | Loads project policy, converts to PolicyEntry, merges with profile tool definitions. |
| `registerProfilePlaceholders(cwd, profile)` | 321–327 | Registers `{{name}}` → filePath mappings from profile frontmatter. |
| `registerProfileRegistryEntries(cwd, profile, rs)` | 329–358 | Registers profile frontmatter registry entries via `registerIfNew()`; maps lifecycle/frequency config. |
| `appendRunStartEvent(run, runId, params)` | 360–372 | Logs `run_start` event with profile and task metadata. |
| `recordContinuationContext(run, isContinuation, events)` | 374–394 | On continuation, reads prior events to provide context summary in display output. |
| `buildActionContexts(actions)` | 396–400 | Converts `ActionParams[]` to `ActionContext[]`; defaults to one `read` action if none provided. |
| `toActionContext(action)` | 402–409 | Maps single `ActionParams` to `ActionContext`; copies optional filePath/command/url/envVar fields. |
| `executeActionLoop(input)` | 411–463 | Iterates over actions, calls `executeWithRetry()` for each, appends assistant session messages; aborts on signal or policy block. |
| `appendHookSessionMessages(run, runId, messages)` | 465–473 | Appends hook-generated user/assistant messages to the session log. |
| `createArtifacts(ctx, run, identity, events, status, agentRan)` | 475–506 | Builds accomplished list and delegates to `generateRunArtifacts()` for handoff/transcript generation. |
| `pushArtifactEvents(events, artifacts)` | 508–519 | Pushes transcript/handoff display events; logs transcript errors if any. |
| `appendRunEndEvent(run, runId, status)` | 521–533 | Logs `run_end` event with status and exit code. |
| `writeFinalSessionState(run, runId, params, status)` | 535–549 | Persists final session state JSON with `endedAt` timestamp. |
| `persistSlots(run)` | 551–558 | Serializes current slot state to `slots.json` in run directory. |
| `persistRegistry(registryStorage)` | 560–566 | Saves registry state to `registry.jsonl` (best-effort). |
| `buildRunResult(run, runId, status, artifacts, events)` | 568–590 | Assembles final `RunResult` with output message based on status. |
| `assertRunNotAborted(signal, message)` | 592–596 | Throws if the abort signal is set; used as guard after each async boundary. |
| `stringifyUnknownError(err)` | 598–600 | Catch-all error-to-string helper (instanceof Error or String cast). |

---

## Internal Types (not exported)

| Type | Lines | Description |
|------|-------|-------------|
| `RunStatus` | 64 | Alias for `RunResult["status"]`: `"completed" | "failed" | "blocked"`. |
| `RunIdentity` | 66–70 | `{baseRunId, isContinuation, runId}` — used to track continuation state. |
| `RunTiming` | 72–75 | `{signal: AbortSignal, timeoutId}` — timeout management. |
| `ActionLoopInput` | 77–88 | Bundled input for `executeActionLoop()`: run dir, policy, hooks, events, actions, signal, profile/task/cwd metadata. |

---

## Key Integration Points

- **Policy** — Calls `mergePolicies()` at startup; action loop delegates to `executeWithRetry()` in `tool-simulator.ts` which calls `evaluate()`.
- **Hooks** — Calls `runPhaseHook()` from `tool-simulator.ts` for `before_agent` and `after_agent` phases; blocks agent execution on hook denial.
- **Registry** — Creates `RegistryStorage` and `ScheduleOrchestrator` at startup; sets as global registry for prompt rendering; persists on teardown.
- **Prompt Slots** — Placeholders registered from profile frontmatter; slots serialized/deserialized for continuation support; `renderPromptWithRegistry()` produces final prompt.
- **Session Continuity** — Runs can be resumed via existing `runId`; slots, profile consistency, and prior events are restored from disk.
