# `runtime/prompt-slots/engine.ts` — Dynamic Prompt Slot Engine

**Purpose:** Three-in-one rendering system that injects dynamic content into agent prompts. Supports (1) **Registry-based rendering** (new preferred path) — full three-section ToC+Injected+Context message via `composeMessage()`, (2) **Placeholder replacement** (legacy) — `{{name}}` substitution with registered markdown file content, and (3) **Prepend slots** (legacy) — named slot entries prepended by priority order. Integrates with the Registry module (Layer 1→2→3→Composer) for unified prompt composition. Includes serialization for multi-turn continuation. Module-level state lives at the top of the file (lines 48–49, 138–141).

## Dependencies

- `node:fs/promises` — `readFile` for placeholder file loading
- `node:path` — `resolve`, `dirname` for path resolution
- `node:url` — `fileURLToPath` for `import.meta.url`
- `../../registry/storage.ts` — `RegistryStorage` type
- `../../registry/orchestration.ts` — `ScheduleOrchestrator` type
- `../../registry/types.ts` — `RunContext` type

## Exports

| Export | Kind | Line | Description |
|---|---|---|---|
| `setRegistry` | function | 57–63 | Activate Registry-based rendering; stores `storage` + `orchestrator` references. Must be called before `renderPromptWithRegistry`. |
| `getRegistry` | function | 66–68 | Return the currently active `RegistryStorage` (or `null`). |
| `getOrchestrator` | function | 71–73 | Return the currently active `ScheduleOrchestrator` (or `null`). |
| `renderPromptWithRegistry` | function | 88–105 | Render full three-section prompt (HEAD ToC + INJECTED + CONTEXT) via the Prompt Registry composer. Falls back to legacy `renderPrompt()` if registry is not configured. |
| `registerPlaceholder` | function | 156–178 | Bind `{{name}}` in base prompts to a markdown file's content (read fresh per call). Also registers into the Registry for unified resolution when active. |
| `unregisterPlaceholder` | function | 186–192 | Remove a placeholder binding; returns `true` if existed. |
| `listPlaceholders` | function | 197–199 | Return a `ReadonlyMap` of all registered placeholder bindings. |
| `setSlot` | function | 205–213 | Create or overwrite a named slot with content, priority, optional `consumes` count, and optional TTL. |
| `clearSlot` | function | 216–220 | Delete a named slot and its corresponding stack. |
| `pushSlot` | function | 222–230 | Push content onto a stack slot (LIFO per name). |
| `popSlot` | function | 232–238 | Pop the top entry from a stack slot; returns the content or `undefined`. |
| `setOnceSlot` | function | 240–242 | Shorthand for `setSlot(name, content, priority, 1, ttlMs)` — auto-consumed after one use. |
| `listSlots` | function | 244–246 | Return a `ReadonlyMap` of all current slots. |
| `listStacks` | function | 248–250 | Return a `ReadonlyMap` of all current stacks. |
| `expireStaleSlots` | function | 252–264 | Remove all slots whose TTL has expired; returns array of expired slot names. |
| `clearHookSlots` | function | 266–274 | Remove all slots with names starting with `hook_`. |
| `renderPrompt` | function | 300–368 | Legacy renderer: (1) replaces `{{name}}` placeholders with file content, (2) prepends all active slots sorted by priority (descending), (3) consumes one-shot slots. |
| `getEventLog` | function | 370–372 | Return the readonly event log array of all slot/placeholder mutations. |
| `reset` | function | 374–379 | Clear all state: slots, stacks, placeholders, and event log. |
| `serializeSlots` | function | 392–406 | Serialize slots, stacks, and placeholders into a plain `SerializedSlots` object for multi-turn persistence. |
| `deserializeSlots` | function | 408–423 | Restore slots, stacks, and placeholders from a serialized `SerializedSlots` object. |
| `PromptSlotChange` | type | 127–132 | Event entry shape: tracks `operation`, `slotName`, optional `content` and `priority`. |
| `SerializedSlots` | type | 385–390 | Serialization shape: `slots`, `stacks`, and `placeholders` records. |

## Internal Types (not exported)

| Type | Line | Description |
|---|---|---|
| `SlotEntry` | 111–117 | Single slot: `content`, `priority`, `consumes` (-1 = persistent, 0+ = remaining), `ttl` (optional ms timestamp), `createdAt`. |
| `StackSlot` | 119–121 | Holds an array of `SlotEntry` for LIFO stacks. |
| `PlaceholderEntry` | 123–125 | Maps a placeholder name to its resolved markdown `filePath`. |

## Lifecycle Flow

1. **Setup**: `setRegistry(storage, orchestrator)` activates the new path, or direct slot/placeholder calls use the legacy path.
2. **Registration**: Hooks/callers register content via `registerPlaceholder` (file-backed `{{name}}`) or `setSlot`/`pushSlot` (inline content).
3. **Rendering**: `renderPromptWithRegistry(base, runCtx)` produces a three-section message via `composeMessage()`. Fallback: `renderPrompt(base)` replaces `{{name}}` → prepends slots.
4. **Cleanup**: `expireStaleSlots()` auto-triggers inside `renderPrompt`. `clearHookSlots()` removes ephemeral hook slots. `reset()` wipes everything.
5. **Persistence**: `serializeSlots()` / `deserializeSlots()` enable round-trip for multi-turn runs.
