# Better Subagent - User Manual for LLM Agents

This manual explains how to use and extend `better-subagent`. Read this before changing public APIs.

---

## What This Project Is

`better-subagent` should be treated primarily as an external subagent runtime skeleton, not as a general conversation database.

The recommended mental model is:

1. load context from simple, explicit sources
2. build a PI subagent invocation from that context
3. archive the returned reasoning, replies, tool calls, and file accesses

The older CRUD-heavy dialogue-memory APIs still exist for compatibility, but they are secondary.

---

## Architecture Overview

The project has a flat structure with `index.ts` as the dual-export entry point:

```text
index.ts
|- core/
|  |- context-sources.ts
|  |- pi-config.ts
|  |- archive-store.ts
|  |- build-prompt.ts
|  |- save-turn.ts
|  |- turns.ts
|  |- tool-calls.ts
|  |- templates.ts
|  |- file-refs.ts
|  |- call-records.ts
|  |- recipes.ts
|  `- crud-factory.ts
|- tool/
|- utils/
`- skills/
```

Recommended execution flow:

```text
caller decides which sources to load
-> context-sources.ts resolves them into strings
-> pi-config.ts builds prompt + execution config
-> adapter/pi-sdk.ts creates an in-memory PI SDK session
-> archive-store.ts stores messages, tool calls, and file accesses
```

---

## Recommended API Surface

### 1. Context loading

Use `core/context-sources.ts` for the minimal built-in loading model.

Built-in source types:

- `jsonl-fields`
  Reads any JSONL file, optionally filters by record IDs, then concatenates caller-chosen fields in caller-chosen order.
- `file`
  Reads a whole file or a line slice.

Important exports:

- `loadJsonlFieldsSource(source)`
- `loadFileSliceSource(source)`
- `loadContextSource(source, registry?)`
- `loadContextSources(sources, registry?)`
- `composeContext(sources, registry?, separator?)`
- `createContextLoaderRegistry(customLoaders)`

This project intentionally does not decide which loader should be used when. The caller supplies that plan.

### 2. PI invocation preparation

Use `buildSubagentPrompt()` and `buildSubagentInvocation()` to combine:

- optional system prompt
- already-built context string
- current task text
- execution metadata such as model, cwd, or output mode

These helpers stay PI-adjacent without depending on PI runtime types.

### 2.5. PI SDK adapter

Use `adapter/pi-sdk.ts` when you want to actually execute a run through PI's SDK.

Important exports:

- `listPiModels(modelRegistry)`
- `resolvePiModel(modelRegistry, currentModel, selection)`
- `runSubagentWithPiSdk(options)`

Design choices based on PI's own docs:

- Execution uses `createAgentSession()` rather than shelling out to `pi -p`.
- Model lookup uses `ModelRegistry.find()` and `ModelRegistry.getAvailable()`.
- Runs use `SessionManager.inMemory()` by default, so they behave like subagent calls rather than normal persisted user sessions.
- Tool selection is passed through the SDK `tools` allowlist directly.

### 3. Result archiving

Use `createArchiveLayout()` and `saveSubagentResult()` for the storage layout aligned with subagent runs.

Archive shape:

- `messages.jsonl`
  Stores both `reasoning` and `reply` records in append order via a `kind` field.
- `tool-calls/<id>.json`
  Stores each tool call's params and result as a standalone artifact linked by `messageId`.
- `external-files.jsonl`
  Registers file read/write accesses so future runs can refer back to file paths without inlining the full file.

Important exports:

- `createArchiveLayout(rootDir)`
- `appendMessageRecord(messagesPath, record)`
- `registerExternalFileAccess(externalFilesPath, record)`
- `saveSubagentResult(layout, input)`

---

## Compatibility APIs

The following older APIs remain available:

- `appendTurn / getTurn / queryTurns / updateTurn / listTurns / findRecentTurns`
- `appendToolCall / getToolCall / queryToolCalls / updateToolCall`
- `appendTemplate / getTemplate / queryTemplates / updateTemplate`
- `appendFileRef / getFileRef / queryFileRefs / updateFileRef`
- `appendCallRecord / getCallRecord / queryCallRecords / updateCallRecord`
- `loadRecipes / getRecipe / addRecipe / updateRecipe`
- `buildPrompt / buildPromptFromRecipe`
- `saveTurn`

These are still supported, but they are no longer the preferred design center.

---

## Key Constraints

- Keep `core/` free of PI runtime dependencies.
- When changing public exports, update this file in the same change.
- The project owns loading primitives and archive primitives, not high-level loading policy.
- Third-party context loading strategies should be added through the loader registry or in tests, not hardcoded into the project.

---

## Development

```bash
bun test
bunx tsc --noEmit
```
