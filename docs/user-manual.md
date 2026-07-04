# Block Agent Core - User Manual for LLM Agents

This manual explains the current public shape of `better-subagent` as it migrates to `block_agent_core`.

---

## What This Project Is

The project should now be treated primarily as a block-based subagent runtime extension for PI Coding Agent.

The extension-facing flow is:

1. load context blocks
2. run a PI SDK subagent with explicit model and tool selection
3. archive results through the default archive module

The old dialogue-memory database tool surface is no longer the recommended or supported extension-facing model.

---

## Extension Tool Surface

The default export registers one PI tool:

- `block_agent_core`

Supported actions:

- `load_context`
- `run_subagent`
- `list_models`
- `archive_result`

Removed extension-facing actions:

- `load`
- `save`
- `query`
- `manage`

### `load_context`

Use this action to compose context text from explicit sources.

Supported source types:

- `jsonl-fields`
- `file`

Inputs:

- `sources`
- optional `separator`

### `run_subagent`

Use this action to execute one PI SDK-backed subagent run.

Required inputs:

- `inputText`
- `runId`
- `keyParts`

Optional inputs:

- `context`
- `sources`
- `separator`
- `systemPrompt`
- `cwd`
- `modelSelection`
- `tools`
- `archiveEnabled`
- `archiveRootDir`

Behavior:

- context sources are composed before execution
- tool selection is passed through the PI SDK allowlist
- model selection supports current, default, or explicit provider/model lookup
- archiving is enabled by default unless `archiveEnabled` is `false`

### `list_models`

Use this action to inspect PI model availability.

Returned model fields include:

- `provider`
- `modelId`
- `displayName`
- `reasoning`
- `input`
- `available`

### `archive_result`

Use this action to explicitly persist results through the default archive module.

Inputs:

- `archiveRootDir` or `runId`
- optional `cwd`
- optional `messages`
- optional `toolCalls`
- optional `externalFiles`

If `archiveRootDir` is omitted and `runId` is present, the default archive path is derived from the working directory.

---

## Architecture Overview

```text
index.ts
|- core/
|  |- context-sources.ts
|  |- subagent-run.ts
|  |- pi-config.ts
|  `- archive-store.ts
|- adapter/
|  `- pi-sdk.ts
|- tool/
|  |- block-agent-core.ts
|  `- actions/
`- skills/
```

Execution flow:

```text
caller chooses context blocks
-> `load_context` composes them
-> `run_subagent` resolves model/tools/turn identity
-> `adapter/pi-sdk.ts` runs an in-memory PI SDK session
-> default archive module writes structured artifacts
```

---

## Important Core Exports

Recommended exports for new work:

- `composeContext`
- `loadContextSource`
- `createContextLoaderRegistry`
- `composeSubagentTurnId`
- `normalizeToolNames`
- `buildSubagentPrompt`
- `listPiModels`
- `resolvePiModel`
- `runSubagentWithPiSdk`
- `createArchiveLayout`
- `createDefaultArchiveRootDir`
- `saveSubagentResult`

Older CRUD-style exports may still exist in the codebase, but they are no longer the design center for extension work.

---

## Key Constraints

- `core/` should remain the main implementation center for reusable logic.
- PI-specific execution should stay in the adapter/tool layers.
- Context loading remains caller-directed; the project provides primitives, not context policy.
- The default archive module is enabled now, but future work may replace it behind the same role boundary.

---

## Development

```bash
bun test
bunx tsc --noEmit
```
