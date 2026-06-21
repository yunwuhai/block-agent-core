# L1: `runtime/tool-simulator.ts` — Tool Execution, Retry & Hook Dispatch

**File purpose:** Simulates tool execution within a single subagent run. Provides the core per-tool interaction pipeline: policy evaluation, before/after tool hook dispatch, simulated tool call/result logging, slot mutation recording, and retry with exponential backoff for transient errors. Also exports the phase-level hook dispatcher (`runPhaseHook`) used by both the orchestrator (for agent-phase hooks) and itself (for tool-phase hooks).

**Imports from:** `config/`, `display/`, `policy/`, `storage/`, `runtime/hooks/`, `runtime/prompt-slots/engine.ts`.

**Lines:** 287 (extracted from the former monolithic `runner.ts` as part of Phase 3 refactor)

---

## Exports (5)

| Export | Kind | Lines | Description |
|--------|------|-------|-------------|
| `PhaseHookOutcome` | `interface` | 22–25 | Return contract for `runPhaseHook`: `allowed` (boolean) and `sessionMessages` (user/assistant messages injected into session). |
| `ToolInteractionResult` | `interface` | 27–30 | Return contract for tool execution: `output` (string) and `blocked` (boolean). |
| `runPhaseHook` | `async function` | 32–69 | Dispatches hook scripts for a given phase (`before_agent`, `after_agent`, `before_tool`, `after_tool`). Selects scripts from `HooksConfig`, calls `runHookScripts()`, registers hook output as prompt slots via `registerHookOutput()`. Returns blocking decision and session messages. |
| `executeWithRetry` | `async function` | 87–142 | Wraps `simulateToolInteraction()` with up to 2 retries (exponential backoff: 1s, 2s). Retries only on transient errors (timeout/network/ECONNREFUSED). Aborts early if signal is triggered. After exhausting retries, returns failure output without blocking. |
| `simulateToolInteraction` | `async function` | 144–287 | Core single-tool execution pipeline: (1) abort checkpoint, (2) policy `evaluate()`, (3) `before_tool` hook dispatch, (4) simulated tool call + result logging to JSONL, (5) `after_tool` hook dispatch, (6) slot mutation event logging. Returns `{output, blocked}`. |

---

## `simulateToolInteraction()` — Per-Tool Pipeline

The function executes these steps for each tool action:

1. **Abort check** (lines 156–158) — Returns `[aborted]` with `blocked: true` if the signal is already triggered.
2. **Policy evaluation** (lines 160–171) — Calls `evaluate(actionCtx, policy)`. If denied, emits a `policy_block` event and returns `[blocked]` with `blocked: true`.
3. **Before-tool hook** (lines 173–198) — Builds `HookContext` with `phase: "before_tool"` and tool args (path, command, url, envVar). Calls `runPhaseHook()`. If blocked, returns immediately. Hook session messages are appended to the run log.
4. **Simulated tool call** (lines 200–233) — Constructs tool arguments from action context, emits formatted `tool_call` display event, logs `call` and `result` entries to the tool log (JSONL), and logs `tool_call`/`tool_result` events.
5. **After-tool hook** (lines 250–265) — Dispatches `after_tool` hook with the same context, updated phase. If blocked, returns immediately.
6. **Hook output injection** (lines 200–273) — If hook scripts produce session messages, their content is prepended to the simulated tool output.
7. **Slot mutation logging** (lines 275–284) — Reads event log from the prompt-slot engine and logs each mutation as a `slot_mutation` event.

---

## Internal Functions (not exported)

| Function | Lines | Description |
|----------|-------|-------------|
| `selectHookScripts(hooks, ctx)` | 71–85 | Routes phase + tool name to the correct hook script array from `HooksConfig`. Uses `ctx.phase` and `ctx.toolName` to select from `before_agent`, `after_agent`, `tools[name].before`, or `tools[name].after`. |

---

## Retry Strategy

`executeWithRetry()` implements a bounded retry loop with these characteristics:

- **Max retries:** 2 (3 total attempts including initial)
- **Backoff:** Exponential with base 1s (attempt 1: 1s, attempt 2: 2s)
- **Retryable errors:** Only errors whose message contains `"timeout"`, `"network"`, or `"ECONNREFUSED"` are retried. All other errors propagate immediately.
- **Abort handling:** Checks `signal.aborted` before each attempt and returns `[aborted]` on detection.
- **Display:** Each retry emits a `run_start`-type display event showing attempt number and previous error.
- **Exhaustion:** After all retries fail, returns failure output string (does not set `blocked: true`).

---

## Key Integration Points

- **Policy** — Calls `evaluate(actionCtx, policy)` from `policy/evaluator.ts` as the first decision gate in `simulateToolInteraction()`.
- **Hooks** — `runPhaseHook()` calls `runHookScripts()` from `runtime/hooks/runner.ts` and `registerHookOutput()` from `runtime/hooks/slot-insertion.ts`.
- **Storage** — Calls `appendEvent()`, `appendSession()`, and `appendToolLog()` from `storage/mod.ts` for all event/session/tool logging.
- **Display** — Uses `formatToolCall()`, `formatToolResult()`, `formatPolicyBlock()`, `formatHookBlock()`, `formatSlotChange()`, and `createEvent()` for TUI event rendering.
- **Prompt Slots** — Reads `getEventLog()` from `runtime/prompt-slots/engine.ts` to log slot mutations as events after each tool interaction.
