# L2 Module — `registry-composer`

**Purpose:** Top-level consumer of the Prompt Registry. Assembles the final LLM prompt message by composing three sections: a Table of Contents (ToC) of available entries, full content of currently scheduled entries, and the base prompt with `{{name}}` placeholders resolved to entry content. Also records call history for every injected entry.

---

## Member Files

| L1 Doc | 1-Line Contribution |
|--------|---------------------|
| `registry-composer.md` | `composeMessage()`: 3-section message builder (ToC + injected entries + placeholder-resolved prompt) with side-effect call recording; `buildToCTable()`: standalone markdown table builder for available entries; `replacePlaceholders()`: resolves `{{name}}` patterns against registry entries by name. |

---

## Internal Relationships

Single-file module. The main flow (`composeMessage`) orchestrates two private helpers and one external pipeline:

```
composeMessage(options)
  ├── 1. HEAD:  buildToCTable(options)
  │            Lists all active (non-expired) entries as a markdown table
  │            with ID, tags, description columns
  │
  ├── 2. BODY:  resolveScheduled(schedule, storage, runCtx)
  │            Delegates to registry-engine for full 5-stage resolution
  │            Side-effect: storage.recordCall() for each injected entry
  │
  └── 3. FOOT:  replacePlaceholders(basePrompt, storage)
               Resolves {{name}} → entry content (inline or filePath)
               Unregistered names kept as-is
```

All three sections are joined with `\n\n`. Empty sections are filtered out (empty ToC, empty schedule when no entries are scheduled, etc.).

---

## Dependencies (outside this module)

**Imports from:**
- `registry-types.md` — `RegistryEntry`, `ResolvedEntry`, `RunContext`
- `registry-storage.md` — `recordCall()` (per-injection audit), `getByName()` (placeholder resolution), `list()` entries for ToC
- `registry-engine.md` (resolution) — `resolveScheduled()` for resolving scheduled entries into `ResolvedEntry[]`
- `registry-engine.md` (orchestration) — `ScheduleOrchestrator` for accessing the current schedule state

**Imported by:**
- `registry-mod.md` — re-exports `composeMessage` and `buildToCTable` as part of the public API

## Physical Location

| Source File | Current Path | Notes |
|------------|-------------|-------|
| `registry/composer.ts` | `registry/composer.ts` | `composeMessage()` — 3-section prompt builder (ToC + injected entries + placeholder resolution) |

> **Step 4a status: DEFERRED.** File remains in the legacy `registry/` directory. Planned move to `backend/computation/` not executed.
