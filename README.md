# Better Subagent

`better-subagent` is a PI Coding Agent extension for running an external subagent with reusable context loading and structured result archiving.

## Recommended design

Treat the project as three parts:

1. Context loading
   Load context fragments from JSONL history or files, then concatenate them in caller-provided order.
2. PI invocation preparation
   Build the final prompt and execution config that will be sent to PI Coding Agent.
3. Result archiving
   Persist tool calls, reasoning, replies, and external file accesses in separate storage shapes for later reuse.

## What the project should and should not do

- It should provide a basic JSONL field loader: choose a file, choose keys, optionally choose record IDs, then concatenate.
- It should provide a file loader and a loader registry so third parties can register richer source types later.
- It should provide a basic archive layout for tool calls, messages, and file access registration.
- It should not decide when to load which context. That policy belongs to callers and tests built on top of the library.

## Storage layout

- `messages.jsonl`
  Stores both `reasoning` and `reply` records in append order.
- `tool-calls/`
  Stores each tool call as its own JSON file, linked to the related message ID.
- `external-files.jsonl`
  Registers file read/write accesses without copying file content into the archive.

## Recommended APIs

- `core/context-sources.ts`
  Context loaders and loader registry.
- `core/pi-config.ts`
  Prompt and invocation config builders.
- `core/archive-store.ts`
  Structured result archiving.
- `core/subagent-run.ts`
  Run request, tool selection, model selection, and turn-id helpers.
- `adapter/pi-sdk.ts`
  PI SDK adapter built on `createAgentSession()`, `ModelRegistry`, and `SessionManager.inMemory()`.

## PI SDK notes this project now follows

- The SDK already supports explicit `tools` allowlists.
- The SDK already supports explicit `model` selection plus `ModelRegistry.find()` and `ModelRegistry.getAvailable()`.
- `createAgentSession()` can run with `SessionManager.inMemory()` so subagent calls do not need to become normal PI sessions.
- The default built-in tool set in PI is `read`, `bash`, `edit`, `write`, but this project keeps tools explicit at the adapter boundary for predictability.

The older dialogue-memory CRUD modules are still present for compatibility, but they are no longer the best mental model for new work.

## Development

```bash
bun test
bunx tsc --noEmit
```
