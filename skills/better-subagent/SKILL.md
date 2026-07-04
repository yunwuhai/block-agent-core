---
name: block-agent-core
description: Compose context blocks, run a PI SDK-backed subagent with explicit model and tool selection, and archive structured results through the default archive module.
---

# Block Agent Core

Use the `block_agent_core` tool when you need a focused external subagent run with explicit context assembly and structured archives.

## When to Use

- You need to assemble context from specific JSONL fields or file slices.
- You want a PI SDK-backed subagent run with explicit model selection.
- You want tool access to be passed as an explicit allowlist.
- You want reasoning, replies, tool calls, and file access records archived in a structured way.

## Actions

### `load_context`

Compose context text from source blocks.

Typical inputs:

- `sources`
- optional `separator`

### `run_subagent`

Execute one subagent run.

Typical inputs:

- `inputText`
- `runId`
- `keyParts`
- optional `context`
- optional `sources`
- optional `modelSelection`
- optional `tools`
- optional `systemPrompt`
- optional `archiveEnabled`
- optional `archiveRootDir`

### `list_models`

List PI models and their availability.

### `archive_result`

Explicitly archive messages, tool calls, and external file records through the default archive module.

## Key Constraints

- Treat context assembly as block composition, not as a generic database query layer.
- Prefer `run_subagent` over directly manipulating old CRUD-style memory records.
- Model selection should be explicit: current, default, or specific provider/model.
- Tool selection should be explicit, not inferred.
