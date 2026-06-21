# L1 — `frontend/operation/orchestrator.ts`

**Purpose:** Top-level run lifecycle orchestrator for efficiency-subagent. Drives run identity resolution, run directory creation, session persistence, profile loading, policy merge, prompt rendering via registry/slots, per-action execution, transcript/handoff generation, and slot/registry persistence.

**Lines:** 548

## Exports

| Export | Kind | Lines | Description |
|---|---|---|---|
| `RunContext` | interface | 49–54 | Input parameters: `cwd`, `params` (`ToolParams`), optional `signal`, optional `timeoutMs`. |
| `RunResult` | interface | 56–64 | Return shape: `runId`, `status`, `handoffPath`, `runDir`, `events`, `output`, optional `transcript`. |
| `executeRun` | async function | 88–101 | Primary entry point. Creates timeout/signal wrapper, delegates to `executeRunWithSignal()`, clears timeout in `finally`. |

## Lifecycle

1. Resolve run identity and continuation state.
2. Create run directory and initialize prompt registry storage/orchestrator.
3. Write running session state and run-created/continuation events.
4. Restore slots on continuation.
5. Load profile and merge project/profile policy.
6. Register profile placeholders and registry entries.
7. Render the full prompt and append it to `session.jsonl` as the user message.
8. Execute the configured action sequence with `executeWithRetry()`.
9. Generate transcript/handoff artifacts.
10. Append run-end event, write final session state, persist slots and registry.

## Internal Functions

| Function | Lines | Description |
|---|---|---|
| `executeRunWithSignal(ctx, signal)` | 103–157 | Core orchestration logic. |
| `createRunTiming(ctx)` | 159–178 | Builds timeout-backed `AbortController` and merges caller signal. |
| `resolveRunIdentity(ctx)` | 180–186 | Resolves base run id, continuation status, and concrete run id. |
| `initializeRegistry(cwd, run)` | 188–196 | Loads `registry.jsonl`, wires `ScheduleOrchestrator`, sets prompt registry globals. |
| `writeRunningSessionState(run, runId, params)` | 198–210 | Writes initial `session.json`. |
| `appendRunCreatedEvent(run, identity)` | 212–219 | Logs `run_created` or `run_continue`. |
| `recordProfileMismatch(ctx, run, identity, events)` | 221–246 | Emits mismatch warning on continuation with a different profile. |
| `restoreSlotsOnContinuation(run, isContinuation, events)` | 248–264 | Restores `slots.json` when continuing. |
| `loadRunProfile(ctx)` | 266–273 | Loads `.profiles/{profile}.md` and wraps errors with profile name. |
| `loadMergedPolicy(ctx, profile)` | 275–286 | Loads project policy and merges profile `tools` allowlist. |
| `registerProfilePlaceholders(cwd, profile)` | 288–294 | Registers frontmatter placeholders. |
| `registerProfileRegistryEntries(cwd, profile, registryStorage)` | 296–325 | Registers frontmatter registry entries with normalized lifecycle/frequency. |
| `normalizeFrequency(frequency)` | 327–336 | Removes undefined frequency keys before registry registration. |
| `appendRunStartEvent(run, runId, params)` | 338–350 | Logs `run_start`. |
| `recordContinuationContext(run, isContinuation, events)` | 338–358 | Adds display context for prior events. |
| `buildActionContexts(actions)` | 360–364 | Converts params actions to policy action contexts; defaults to one read. |
| `toActionContext(action)` | 366–373 | Maps optional action fields to `ActionContext`. |
| `executeActionLoop(input)` | 375–423 | Executes each action and appends assistant messages. |
| `createArtifacts(ctx, run, identity, events, status)` | 425–451 | Delegates to `generateRunArtifacts()`. |
| `pushArtifactEvents(events, artifacts)` | 453–464 | Adds transcript/handoff display events. |
| `appendRunEndEvent(run, runId, status)` | 466–478 | Logs `run_end`. |
| `writeFinalSessionState(run, runId, params, status)` | 480–494 | Writes final `session.json`. |
| `persistSlots(run)` | 496–503 | Writes `slots.json`. |
| `persistRegistry(registryStorage)` | 505–511 | Saves `registry.jsonl`. |
| `buildRunResult(run, runId, status, artifacts, events)` | 513–535 | Assembles `RunResult`. |
| `assertRunNotAborted(signal, message)` | 537–541 | Throws if signal is aborted. |
| `stringifyUnknownError(err)` | 543–545 | Converts unknown errors to strings. |
