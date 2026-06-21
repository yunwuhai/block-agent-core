# L2 Module: `prompt-engine` — Dynamic Prompt Slot Engine

**Purpose:** Standalone rendering engine that injects dynamic content into agent prompts via three strategies: (1) Registry-based composition (preferred path), (2) `{{name}}` placeholder replacement with markdown file content (legacy), and (3) named slot prepending by priority order (legacy). Maintains module-level mutable state for slots, stacks, placeholders, and an append-only event log. Supports serialization for multi-turn continuation across runs.

**Module type:** Engine — provides a stateful service consumed by both `runtime-core` and `hook-system`.

---

## Member Files

| L1 Doc | Source File | Role |
|--------|-------------|------|
| `runtime-prompt-slots-engine.md` | `backend/computation/prompt/engine.ts` | Single-file module. Contains all slot/placeholder state, the registry rendering pipeline, legacy renderer, mutation operations, persistence helpers, and event log. |

*(Single file; no barrel needed — callers import directly from `backend/computation/prompt/engine.ts`.)*

---

## Exported API Surface

### Registry Integration (new path)
| Export | Description |
|--------|-------------|
| `setRegistry(storage, orchestrator)` | Activate Registry-based rendering. Stores references; must be called before `renderPromptWithRegistry`. |
| `getRegistry()` | Return current `RegistryStorage` or `null`. |
| `getOrchestrator()` | Return current `ScheduleOrchestrator` or `null`. |
| `renderPromptWithRegistry(base, runCtx)` | Render full three-section prompt (HEAD ToC + INJECTED + CONTEXT) via Prompt Registry composer. Falls back to `renderPrompt()` if registry not configured. |

### Placeholder Operations (legacy, file-backed)
| Export | Description |
|--------|-------------|
| `registerPlaceholder(name, filePath)` | Bind `{{name}}` to a markdown file; re-reads on each render. Also registers into Registry when active. |
| `unregisterPlaceholder(name)` | Remove a placeholder binding. |
| `listPlaceholders()` | Return `ReadonlyMap` of all placeholder bindings. |

### Slot Operations (legacy, inline content)
| Export | Description |
|--------|-------------|
| `setSlot(name, content, priority, consumes?, ttl?)` | Create/overwrite named slot with priority, optional consume count, optional TTL. |
| `clearSlot(name)` | Delete named slot and its stack. |
| `pushSlot(name, content, ...)` | Push onto a LIFO stack per name. |
| `popSlot(name)` | Pop top entry from stack; returns content or `undefined`. |
| `setOnceSlot(name, content, priority, ttl?)` | Shorthand for `setSlot` with `consumes=1` — auto-consumed after one use. |
| `listSlots()` | Return `ReadonlyMap` of all active slots. |
| `listStacks()` | Return `ReadonlyMap` of all active stacks. |

### Lifecycle & Cleanup
| Export | Description |
|--------|-------------|
| `expireStaleSlots()` | Remove slots with expired TTL; returns array of removed names. |
| `clearHookSlots()` | Remove all slots with names starting with `hook_`. |
| `renderPrompt(base)` | Legacy renderer: replace `{{name}}` placeholders with file content, then prepend active slots by descending priority. Consumes one-shot slots. |
| `getEventLog()` | Return readonly append-only event log of all slot/placeholder mutations. |
| `reset()` | Clear all module-level state: slots, stacks, placeholders, event log. |

### Persistence
| Export | Description |
|--------|-------------|
| `serializeSlots()` | Serialize slots, stacks, and placeholders into `SerializedSlots` for multi-turn persistence. |
| `deserializeSlots(data)` | Restore slots, stacks, and placeholders from a serialized `SerializedSlots` object. |

### Types
| Export | Description |
|--------|-------------|
| `PromptSlotChange` | Event entry: `{operation, slotName, content?, priority?}` |
| `SerializedSlots` | Serialization shape: `{slots, stacks, placeholders}` records |

### Internal Types (not exported)
| Type | Description |
|------|-------------|
| `SlotEntry` | `{content, priority, consumes, ttl?, createdAt}` — single slot entry |
| `StackSlot` | `{entries: SlotEntry[]}` — LIFO stack for push/pop |
| `PlaceholderEntry` | `{filePath}` — maps name to markdown file path |

---

## Internal Architecture

```
Module-level state (singleton, lines 48–49, 138–141)
├── slots:     Map<name, SlotEntry>
├── stacks:    Map<name, StackSlot>
├── placeholders: Map<name, PlaceholderEntry>
├── eventLog:  PromptSlotChange[]
├── registryStorage: RegistryStorage | null
└── orchestrator: ScheduleOrchestrator | null
```

**Rendering pipeline:**
```
renderPromptWithRegistry(base, runCtx)
  ├── Registry active? → composeMessage() → three-section output
  │     ├── HEAD (Table of Contents)
  │     ├── INJECTED (priority-ordered entries)
  │     └── CONTEXT (base prompt)
  └── Registry inactive? → renderPrompt(base) [legacy]
        ├── Step 1: Replace {{name}} placeholders with readFile(filePath)
        ├── Step 2: expireStaleSlots()
        ├── Step 3: Prepend active slots sorted by priority (descending)
        └── Step 4: Consume one-shot slots (consumes-- → remove if 0)
```

**Lifecycle:**
1. Setup: `setRegistry()` activates new path, or direct slot/placeholder calls use legacy path
2. Registration: Callers register content via `registerPlaceholder()` or `setSlot()`/`pushSlot()`
3. Rendering: `renderPromptWithRegistry()` or `renderPrompt()` produces final text
4. Cleanup: `expireStaleSlots()` (auto-triggered in render), `clearHookSlots()` (manual), `reset()` (full wipe)
5. Persistence: `serializeSlots()` / `deserializeSlots()` for multi-turn continuation

---

## Internal Relationships (Data/Call Flow)

```
runtime-core (orchestrator.ts)              hook-system (slot-insertion.ts)
        │                                            │
        │ setRegistry(storage, orch)                  │ injectHookOutputAsSlot(phase, result)
        │ renderPromptWithRegistry(base, ctx)         │   → setSlot("hook_{phase}_{profile}", ...)
        │ serializeSlots() / deserializeSlots()       │ registerHookOutput(result, ctx)
        │ registerPlaceholder(name, path)             │   → registry.register() + orchestrator.scheduleIds()
        ▼                                            ▼
              prompt-engine (module-level state)
                         │
                         │ readFile (for {{name}} placeholders)
                         │ composeMessage() (registry path)
                         ▼
                    registry/
                    (RegistryStorage, ScheduleOrchestrator,
                     composeMessage from Layer 1→2→3→Composer)
```

**Key flows:**
1. **Runner initializes:** `executeRun()` calls `setRegistry(storage, orchestrator)` to wire the engine
2. **Hook output injection:** `slot-insertion.ts` calls `setSlot()` directly (lightweight) or `registerHookOutput()` which goes through registry scheduling
3. **Runner renders:** `executeRun()` calls `renderPromptWithRegistry()` → engine produces final prompt
4. **Continuation:** Runner calls `deserializeSlots(data)` to restore prior state, `serializeSlots()` to persist

---

## External Dependencies (L1 docs outside this module)

| Dependency | L1 Doc | Used For |
|------------|--------|----------|
| Registry storage | (registry L1 docs) | `RegistryStorage` type reference; `composeMessage()` call for three-section prompt |
| Registry orchestration | (registry L1 docs) | `ScheduleOrchestrator` type reference |
| Registry types | (registry L1 docs) | `RunContext` type for `renderPromptWithRegistry()` signature |
| Node.js `fs/promises` | — | `readFile` for placeholder file content |
| Node.js `path` | — | `resolve`, `dirname` for file path resolution |

## Physical Location

| Source File | Current Path | Notes |
|------------|-------------|-------|
| `runtime/prompt-slots/engine.ts` | `backend/computation/prompt/engine.ts` | Stateful rendering engine — slots, stacks, placeholders, registry integration |

> **Step 4 reorganization status: COMPLETE.** The prompt engine now lives in the Backend 计算 layer under `backend/computation/prompt/`.
