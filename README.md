# Better Subagent

`better-subagent` is evolving into `block_agent_core`: a PI Coding Agent extension for block-based context assembly, PI SDK subagent execution, and structured result archiving.

## What it does

The new system is built around four extension-facing actions:

- `load_context`
  Compose context blocks from JSONL fields and file slices.
- `run_subagent`
  Run a PI SDK-backed subagent with explicit input text, model selection, tool selection, turn identity, and default archiving.
- `list_models`
  Inspect PI models that are known and currently available.
- `archive_result`
  Persist reasoning, replies, tool calls, and external file access records through the default archive module.

## Internal shape

The implementation is centered on:

- `core/context-sources.ts`
  Context block loaders and loader registry.
- `core/subagent-run.ts`
  Turn identity, model selection, and tool selection primitives.
- `core/pi-config.ts`
  Prompt and invocation builders.
- `adapter/pi-sdk.ts`
  PI SDK execution layer using `createAgentSession()` and `SessionManager.inMemory()`.
- `core/archive-store.ts`
  Default archive module.

## Default archive behavior

By default, subagent runs archive into a `.block-agent-core/runs/<runId>/` layout under the working directory.

Stored artifacts:

- `messages.jsonl`
- `tool-calls/<id>.json`
- `external-files.jsonl`

The archive behavior is treated as a replaceable module boundary for future work, but the current implementation ships with one default archive module enabled.

## Development

```bash
bun test
bunx tsc --noEmit
```
