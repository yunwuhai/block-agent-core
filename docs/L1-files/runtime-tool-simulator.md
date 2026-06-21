# L1 — `frontend/operation/tool-simulator.ts`

**Purpose:** Simulates tool execution within a single subagent run. Provides policy evaluation, simulated tool call/result logging, prompt-slot mutation logging, and retry with exponential backoff for transient errors.

**Imports from:** `frontend/display/`, `backend/computation/policy/`, `backend/computation/prompt/engine.ts`, and `backend/storage/`.

**Lines:** 156

## Exports

| Export | Kind | Lines | Description |
|---|---|---|---|
| `ToolInteractionResult` | interface | 17–20 | Return contract for tool execution: `output` string and `blocked` boolean. |
| `executeWithRetry` | async function | 22–72 | Wraps `simulateToolInteraction()` with up to 2 retries and exponential backoff. Retries timeout/network/ECONNREFUSED errors only. |
| `simulateToolInteraction` | async function | 74–156 | Single-tool pipeline: abort check, policy `evaluate()`, simulated call/result JSONL logging, slot mutation event logging. |

## Pipeline

1. Abort check returns `[aborted]` with `blocked: true` if the signal is already triggered.
2. Policy evaluation calls `evaluate(actionCtx, policy)` and records `policy_block` if denied.
3. Tool call simulation emits display events, appends call/result entries to `tools.jsonl`, and records `tool_call`/`tool_result` events.
4. Slot mutation logging reads `getEventLog()` and appends `slot_mutation` events.

## Retry Strategy

- Max retries: 2 (3 total attempts including the initial attempt).
- Backoff: 1s, then 2s.
- Retryable errors: messages containing `timeout`, `network`, or `ECONNREFUSED`.
- Abort handling: returns `[aborted]` immediately when the signal is aborted.
