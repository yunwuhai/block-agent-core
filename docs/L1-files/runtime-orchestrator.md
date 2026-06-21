# L1 — `frontend/operation/orchestrator.ts`

**Purpose:** Top-level run lifecycle orchestrator for efficiency-subagent. Drives run identity resolution, run directory creation, session persistence, profile loading, policy merge, prompt rendering via registry/slots, per-action execution, transcript/handoff generation, and slot/registry persistence.

**Lines:** 500

## Exports

| Export | Kind | Lines | Description |
|---|---|---|---|
| `RunContext` | interface | 40–45 | Input parameters: `cwd`, `params` (`ToolParams`), optional `signal`, optional `timeoutMs`. |
| `RunResult` | interface | 47–55 | Return shape: `runId`, `status`, `handoffPath`, `runDir`, `output`, optional `transcript`, optional `transcriptPath`. |
| `executeRun` | async function | 78–91 | Primary entry point. Creates timeout/signal wrapper, delegates to `executeRunWithSignal()`, clears timeout in `finally`. |

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
| `executeRunWithSignal(ctx, signal)` | 93–141 | Core orchestration logic. |
| `createRunTiming(ctx)` | 143–162 | Builds timeout-backed `AbortController` and merges caller signal. |
| `resolveRunIdentity(ctx)` | 164–169 | Resolves base run id, continuation status, and concrete run id. |
| `initializeRegistry(cwd, run)` | 172–180 | Loads `registry.jsonl`, wires `ScheduleOrchestrator`, sets prompt registry globals. |
| `writeRunningSessionState(run, runId, params)` | 182–194 | Writes initial `session.json`. |
| `appendRunCreatedEvent(run, identity)` | 196–203 | Logs `run_created` or `run_continue`. |
| `recordProfileMismatch(ctx, run, identity)` | 205–223 | Logs `profile_mismatch` on continuation with a different profile. |
| `restoreSlotsOnContinuation(run, isContinuation)` | 225–239 | Restores `slots.json` when continuing. |
| `loadRunProfile(ctx)` | 241–248 | Loads `.profiles/{profile}.md` and wraps errors with profile name. |
| `loadMergedPolicy(ctx, profile)` | 250–261 | Loads project policy and merges profile `tools` allowlist. |
| `registerProfilePlaceholders(cwd, profile)` | 263–269 | Registers frontmatter placeholders. |
| `registerProfileRegistryEntries(cwd, profile, registryStorage)` | 271–300 | Registers frontmatter registry entries with normalized lifecycle/frequency. |
| `normalizeFrequency(frequency)` | 302–311 | Removes undefined frequency keys before registry registration. |
| `appendRunStartEvent(run, runId, params)` | 313–325 | Logs `run_start`. |
| `buildActionContexts(actions)` | 327–331 | Converts params actions to policy action contexts; defaults to one read. |
| `toActionContext(action)` | 333–340 | Maps optional action fields to `ActionContext`. |
| `executeActionLoop(input)` | 342–389 | Executes each action and appends assistant messages. |
| `createArtifacts(ctx, run, identity, status)` | 391–416 | Reads durable event count and delegates to `generateRunArtifacts()`. |
| `appendRunEndEvent(run, runId, status)` | 418–430 | Logs `run_end`. |
| `writeFinalSessionState(run, runId, params, status)` | 432–446 | Writes final `session.json`. |
| `persistSlots(run)` | 448–455 | Writes `slots.json`. |
| `persistRegistry(registryStorage)` | 457–463 | Saves `registry.jsonl`. |
| `buildRunResult(run, runId, status, artifacts)` | 465–486 | Assembles `RunResult`. |
| `assertRunNotAborted(signal, message)` | 488–492 | Throws if signal is aborted. |
| `stringifyUnknownError(err)` | 494–496 | Converts unknown errors to strings. |
| `isoNow()` | 498–500 | Returns the current ISO timestamp for runtime JSONL records. |
