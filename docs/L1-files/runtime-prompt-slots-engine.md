# L1 — `backend/computation/prompt/engine.ts`

**Purpose:** Dynamic prompt rendering engine. Supports registry-based rendering (preferred), file-backed placeholder replacement, and legacy prepended slots. Also serializes slot/placeholder state for continuation runs.

## Exports

| Export | Kind | Lines | Description |
|---|---|---|---|
| `setRegistry` | function | 55–61 | Activates registry-based rendering by storing `RegistryStorage` and `ScheduleOrchestrator`. |
| `getRegistry` | function | 64–66 | Returns active registry storage or `null`. |
| `getOrchestrator` | function | 69–71 | Returns active schedule orchestrator or `null`. |
| `renderPromptWithRegistry` | async function | 86–103 | Renders full registry-composed prompt; falls back to `renderPrompt()` when registry is inactive and omits absent optional run context. |
| `PromptSlotChange` | interface | 125–130 | Event-log entry for slot/placeholder mutations. |
| `registerPlaceholder` | function | 154–175 | Binds `{{name}}` to file content and registers a file entry when registry is active. Registry defaults provide lifecycle metadata. |
| `unregisterPlaceholder` | function | 184–190 | Removes a placeholder binding. |
| `listPlaceholders` | function | 195–197 | Returns current placeholder map. |
| `setSlot` | function | 203–212 | Creates/overwrites an inline slot with priority, consume count, and optional TTL. |
| `clearSlot` | function | 214–218 | Deletes a slot and matching stack. |
| `pushSlot` | function | 220–228 | Pushes content onto a named LIFO stack. |
| `popSlot` | function | 230–236 | Pops content from a named stack. |
| `setOnceSlot` | function | 238–240 | Creates a one-use slot. |
| `listSlots` | function | 242–244 | Returns current slots. |
| `listStacks` | function | 246–248 | Returns current stack slots. |
| `expireStaleSlots` | function | 250–262 | Removes expired TTL slots. |
| `renderPrompt` | async function | 288–356 | Legacy renderer: placeholder substitution plus priority-sorted slot prepending. |
| `getEventLog` | function | 358–360 | Returns mutation event log. |
| `reset` | function | 362–367 | Clears slots, stacks, placeholders, and event log. |
| `SerializedSlots` | interface | 373–378 | Serialization shape for slots, stacks, placeholders. |
| `serializeSlots` | function | 380–394 | Serializes prompt engine state. |
| `deserializeSlots` | function | 396–411 | Restores serialized prompt engine state. |

## Notes

- Registry composition is the preferred path for ordered prompt loading.
- Slot and placeholder support remains for continuation compatibility and legacy profiles.
- Lifecycle-script slot cleanup was removed with that subsystem.
