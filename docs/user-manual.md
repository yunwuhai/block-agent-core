# Better Subagent — User Manual for LLM Agents

This manual explains how to use and understand the better-subagent project. It is written for LLM agents that need to invoke, modify, or extend this plugin, not for human end users. Read this before reading source code; it provides architectural orientation and covers all public interfaces.

---

## What This Project Is

better-subagent is a **Dialogue Memory Database**. It provides structured conversation persistence: storing conversation turns, tool call records, templates, file references, and call records as JSONL files with full CRUD support. It also provides recipe-based prompt assembly.

---

## Architecture Overview

The project has a flat two-layer structure (`core/` + `tool/` + `utils/`), with `index.ts` as the dual-export entry point:

```
index.ts                 # Entry: dual export (PI extension + core API)
├── core/                # Core layer — pure functions, zero PI dependency
│   ├── types.ts         #   Shared types (TurnInput, Record, etc.)
│   ├── turns.ts         #   Conversation turn CRUD
│   ├── tool-calls.ts    #   Tool call record CRUD
│   ├── templates.ts     #   Template CRUD
│   ├── file-refs.ts     #   File reference CRUD
│   ├── call-records.ts  #   Call record CRUD
│   ├── recipes.ts       #   Recipe TOML loader + CRUD
│   ├── build-prompt.ts  #   Prompt assembly from recipe zones
│   └── save-turn.ts     #   Orchestrator: atomic save (.md + 4 JSONL tables)
├── utils/               # Utility layer
│   ├── jsonl.ts         #   JSONL read/write (atomic via .tmp + rename)
│   ├── glob.ts          #   Glob pattern matching (** / * / ?)
│   └── toml.ts          #   TOML read/write (smol-toml)
├── tool/                # PI integration layer
│   ├── dialogue-memory.ts  # Tool registration (dialogue_memory)
│   └── actions/            # Action handlers (load/save/query/manage)
├── skills/              # PI skill definitions
└── docs/                # Documentation
```

**Execution flow:**
```
User invokes tool → index.ts validates params → dispatches to action handler
→ action handler calls core functions
→ core functions read/write JSONL/TOML files via utils/
→ result returned to user
```

---

## How to Invoke

### Default Export (PI Extension)

When installed as a PI extension, the plugin automatically registers the `dialogue_memory` tool with four actions:

| Action   | Description                                         |
|----------|-----------------------------------------------------|
| `save`   | Save the current conversation turn                   |
| `load`   | Load historical records and build a prompt           |
| `query`  | Query records (turns, tool calls, etc.)              |
| `manage` | Manage recipes and templates                         |

### Named Exports (Core API)

Import named functions directly from `index.ts`:

| Function | Purpose |
|----------|---------|
| `saveTurn` | Atomic turn save (writes .md + appends to 4 JSONL tables) |
| `appendTurn / getTurn / queryTurns / updateTurn` | Turn CRUD |
| `listTurns(tablePath)` | List all turns (convenience wrapper for `queryTurns(path, {})`) |
| `findRecentTurns(dirPath, limit)` | Return last N turns across all JSONL files in a directory |
| `appendToolCall / getToolCall / queryToolCalls / updateToolCall` | Tool call CRUD |
| `appendTemplate / getTemplate / queryTemplates / updateTemplate` | Template CRUD |
| `appendFileRef / getFileRef / queryFileRefs / updateFileRef` | File reference CRUD |
| `appendCallRecord / getCallRecord / queryCallRecords / updateCallRecord` | Call record CRUD |
| `loadRecipes / getRecipe / addRecipe / updateRecipe` | Recipe TOML CRUD |
| `buildPrompt(recipePath, callRecord, resolver)` | Build a prompt from recipe zones |
| `buildPromptFromRecipe(recipe, callRecord, resolver)` | Build a prompt from an already-loaded recipe |

### API Usage Examples

```typescript
import { appendTurn, queryTurns } from "better-subagent";

// Save a turn
await appendTurn(tablePath, "turn-001", "/path/to/turn.md", {
  userText: "Write a function to calculate fibonacci numbers",
  assistantBlocks: [{ type: "text", text: "..." }],
  tags: ["math"],
});

// Query by tags
const turns = await queryTurns(tablePath, { tags: ["math"] });

// List all turns
const allTurns = await listTurns(tablePath);

// Find recent turns
const recent = await findRecentTurns("/data/turns", 10);
```

---

## Recipe System

Recipes define the structure for prompt assembly:

```toml
[[recipes]]
id = "default"
name = "Default"
description = "Standard setup"

[[recipes.zones]]
name = "config"
position = "before"
separator = ""

[[recipes.zones]]
name = "history"
position = "before"
separator_before = "---history---"
separator_after = "---end-history---"
```

`buildPrompt(recipePath, callRecord, resolver)` assembles a prompt by processing each zone in the recipe. Zones are inserted around `{{CURRENT_TURN}}` according to their `position` (before/after). The `resolver` callback resolves `Ref` references in zone content.

---

## Key Constraints

- **Core purity**: `core/` modules are pure functions with zero PI dependency and zero I/O — all I/O is delegated to `utils/`.
- **Atomic writes**: JSONL files use `.tmp` + rename for crash safety.
- **TypeScript strictness**: `tsconfig` enables `exactOptionalPropertyTypes` and `verbatimModuleSyntax` — use `import type` for type-only imports, no `as any`, no `@ts-ignore`.
- **Test layout**: Test files live next to their source files (e.g., `core/turns.test.ts`).
- **PI extension deployment**: Via symlink: `ln -s $(pwd) ~/.pi/agent/extensions/better-subagent`.

---

## Further Reading

- **L1 file docs**: `docs/L1-files/` — Per-file source-level documentation with line references
- **Source code**: Modules in `core/` export clearly named functions with JSDoc comments — readable directly.
