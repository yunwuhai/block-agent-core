# L2 Module: Prompt Engine

**Purpose:** Stateful prompt rendering service. Provides registry-based composition, file-backed placeholder substitution, legacy prepended slots, mutation logging, and serialization for continuation runs.

## Member Files

| L1 Doc | Source File | Role |
|---|---|---|
| `runtime-prompt-slots-engine.md` | `backend/computation/prompt/engine.ts` | Single-file prompt engine containing registry wiring, placeholder API, slot API, rendering, event log, and serialization. |

## API Groups

| Group | Exports |
|---|---|
| Registry integration | `setRegistry`, `getRegistry`, `getOrchestrator`, `renderPromptWithRegistry` |
| Placeholders | `registerPlaceholder`, `unregisterPlaceholder`, `listPlaceholders` |
| Slots | `setSlot`, `clearSlot`, `pushSlot`, `popSlot`, `setOnceSlot`, `listSlots`, `listStacks`, `expireStaleSlots` |
| Rendering/lifecycle | `renderPrompt`, `getEventLog`, `reset` |
| Persistence | `serializeSlots`, `deserializeSlots`, `SerializedSlots` |

## Flow

```
orchestrator.ts
  -> setRegistry(storage, orchestrator)
  -> registerPlaceholder(...) from profile frontmatter
  -> renderPromptWithRegistry(basePrompt, runCtx)
       -> composeMessage(...) when registry active
       -> renderPrompt(...) fallback otherwise
  -> serializeSlots() / deserializeSlots() for continuation
```

## Notes

- Registry composition is the preferred path for ordered prompt loading.
- Slot support remains as a legacy compatibility layer.
- Lifecycle-script slot APIs were removed with that subsystem.
