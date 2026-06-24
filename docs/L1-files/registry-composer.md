> **REORGANIZED:** The registry subsystem has been restructured into a core/runtime split:
> - **Algorithm layer** moved to `core/` — core/registry.ts, core/pipeline.ts, core/composer.ts
> - **I/O layer** moved to `runtime/` — runtime/registry-store.ts, runtime/actions.ts
> See `docs/L1-files/core-*.md` and `docs/L1-files/runtime-*.md` for the current implementations.
> This file documents the LEGACY module and is retained for reference during migration.

# `registry/composer.ts` — Message Composer

**File purpose:** Assembles the final LLM prompt message from three sections — a Table of Contents (ToC) of available entries, full content of currently scheduled entries, and the base prompt with `{{name}}` placeholders resolved. Also records call history for injected entries.

**Line count:** 206 lines (with imports and blank lines)  
**Dependencies:** `registry/types.ts`, `registry/storage.ts`, `registry/orchestration.ts`, `registry/resolution.ts`

---

## Exports

| # | Export | Kind | Lines | Description |
|---|--------|------|-------|-------------|
| 1 | `ComposeOptions` | interface | 136–147 | Input options for `composeMessage`: `basePrompt` (the raw prompt with optional `{{name}}` placeholders), `orchestrator` (Layer 3 schedule holder), `storage` (Layer 1 for placeholder resolution), and optional `runCtx`/`lifecycleMap` for filtering active entries. |
| 2 | `composeMessage` | async function | 160–203 | **Main entry point.** Builds a 3-section message string: (1) ToC table via `buildToCTable`, (2) resolved scheduled entries via `resolveScheduled` from Layer 2, (3) placeholder-resolved prompt via `replacePlaceholders`. Filters out empty sections and joins with `\n\n`. Side-effect: calls `storage.recordCall()` for each injected entry. |
| 3 | `buildToCTable` | function (re-exported) | 110–130 | Standalone ToC builder, re-exported for tests/debugging. Lists all active (non-expired) entries as a markdown table with ID, tags, and description columns. Empty when no entries are active. |

### Private internals (not exported)

| # | Name | Kind | Lines | Description |
|---|------|------|-------|-------------|
| — | `PLACEHOLDER_RE` | const regex | 27 | Matches `{{word_chars}}` patterns. |
| — | `replacePlaceholders` | async function | 43–90 | Replaces `{{name}}` patterns in the base prompt with content from registry entries. Resolution order: (1) `storage.getByName(name)` for explicit bindings, (2) unregistered names left as-is. Content sources: inline `entry.content` first, then `entry.filePath` (read from disk), or a warning comment on failure. Applies replacements in reverse index order to keep positions valid. |

---

## Composition flow

```
ComposeOptions ──→ 1. HEAD (ToC) ──→ 2. INJECTED (scheduled) ──→ 3. CONTEXT (prompt) ──→ final string
                    (buildToCTable)   (resolveScheduled +        (replacePlaceholders)
                                       recordCall per entry)
```

The ToC section is always present (even if empty, it's filtered out later). The injected section exists only when the schedule is non-empty and `runCtx` is provided. The context section always runs placeholder replacement.
