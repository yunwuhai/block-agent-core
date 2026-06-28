---
name: dialogue-memory
description: Persist and query structured conversation memory using JSONL-backed tables. Save conversation turns, tool calls, file references, templates, recipes, and build prompts. Every save produces a .md file and atomic JSONL records.
---

# Dialogue Memory

Manage a structured conversation memory database. Store turns, tool calls, file references, templates, and call records as JSONL files with an atomic save orchestrator. Includes a recipe-based prompt builder.

## When to Use

- **Save a conversation turn** — use `saveTurn` to write a .md file + append to 4 JSONL tables atomically.
- **Query past turns** — use `queryTurns`, `listTurns`, or `findRecentTurns` to retrieve conversation history by tags or IDs.
- **Build a prompt** — use `buildPrompt` or `buildPromptFromRecipe` to assemble context from recipe zones around `{{CURRENT_TURN}}`.
- **Track tool calls** — use `appendToolCall` / `queryToolCalls` for per-turn tool invocation records.

## Invocation

### Named exports (core API — zero PI dependency)

| Function | Purpose |
|----------|---------|
| `saveTurn(params)` | Atomic turn save: renders .md + appends to turns, tool-calls, file-refs, call-records tables |
| `appendTurn / getTurn / queryTurns / updateTurn` | Turn CRUD over JSONL |
| `listTurns(tablePath)` | List all turns (convenience wrapper for `queryTurns(path, {})`) |
| `findRecentTurns(dirPath, limit)` | Return last N turns across all JSONL files in a directory |
| `appendToolCall / getToolCall / queryToolCalls / updateToolCall` | Tool call CRUD |
| `appendTemplate / getTemplate / queryTemplates / updateTemplate` | Template CRUD |
| `appendFileRef / getFileRef / queryFileRefs / updateFileRef` | File reference CRUD |
| `appendCallRecord / getCallRecord / queryCallRecords / updateCallRecord` | Call record CRUD |
| `loadRecipes / getRecipe / addRecipe / updateRecipe` | Recipe TOML CRUD |
| `buildPrompt(recipePath, callRecord, resolver)` | Build a prompt from recipe zones |
| `buildPromptFromRecipe(recipe, callRecord, resolver)` | Build a prompt from an already-loaded recipe |

### Default export (PI extension)

When loaded as a PI extension, registers the `dialogue_memory` tool with four actions: `save`, `load`, `query`, `manage`.

## Architecture

```
index.ts → dual export: default (PI extension) + named (core API)

core/       Pure functions, zero PI, zero I/O
  turns.ts        Turn CRUD (append/get/query/update/list/findRecent)
  tool-calls.ts   Tool call CRUD
  templates.ts    Template CRUD
  file-refs.ts    File reference CRUD
  call-records.ts Call record CRUD
  recipes.ts      Recipe TOML CRUD
  build-prompt.ts Prompt assembly from recipe zones
  save-turn.ts    Orchestrator: .md render + 4-table append
  types.ts        Shared TypeScript types

tool/       PI integration layer
  dialogue-memory.ts   Registers dialogue_memory tool
  actions/             Action handlers: load, save, query, manage

utils/      Shared helpers
  jsonl.ts   JSONL read/append/write/update/delete (atomic .tmp + rename)
  glob.ts    Glob pattern matching (** / * / ?)
  toml.ts    TOML read/write (smol-toml)
```

## Key Constraints

- `core/` modules are pure functions — they accept file paths, delegate I/O to `utils/`.
- JSONL files use atomic writes (`.tmp` + rename) for crash safety.
- `tsconfig` enforces `verbatimModuleSyntax` and `exactOptionalPropertyTypes`.
