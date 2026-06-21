# L1 — `runtime/hooks/slot-insertion.ts`

**Purpose:** Bridges hook execution output into the prompt-slot system. Provides two
injection strategies — a lightweight slot-setter for ad-hoc use and a full
registry-backed entry that auto-schedules itself for the next outgoing message.

---

## Exports

### `HookPhase` (type, line 5)

Union of four hook lifecycle stages: `"before_agent"`, `"after_agent"`,
`"before_tool"`, `"after_tool"`. Used to scope slot names and registry tags.

---

### `injectHookOutputAsSlot()` (lines 7–18)

Writes hook `slotContent` into the prompt-slot engine via `setSlot()`.

- **Parameters:** `phase` (HookPhase), `result` (HookResult), `profileName` (string)
- **Behaviour:** Skips silently if `result.slotContent` is empty. Otherwise derives
  a slot name as `hook_${phase}_${profileName}` and injects with priority `-10`
  (low, overridable via `setSlot`'s usual `priority` semantics).
- **Use case:** Direct slot insertion without the registry; fires and forgets.

---

### `registerHookOutput()` (lines 33–61)

Registers hook output as a Prompt Registry entry with automatic scheduling.

- **Parameters:** `result` (HookResult), `ctx` (HookContext)
- **Returns:** Registered entry ID (`string`) or `null` if no content / registry
  unavailable.
- **Behaviour:**
  1. Short-circuits to `injectHookOutputAsSlot()` when the registry or
     orchestrator is not active (graceful fallback).
  2. Registers a new `type: "hook-output"` entry with tags derived from phase,
     tool name, profile, and `"auto-generated"`.
  3. Assigns `lifecycle: session` (expires at run end) and schedules the entry
     via `orchestrator.scheduleIds([id])`.
- **Use case:** Full registry-aware injection that participates in scheduling
  and can be referenced, cleared, or re-ordered alongside other prompt entries.
