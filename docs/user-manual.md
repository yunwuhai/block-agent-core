# Block Agent Core - User Manual for LLM Agents

## What This Project Is

`block_agent_core` is now a session-first runtime extension for PI Coding Agent.

The main extension-facing model is:

1. create a persistent session
2. mount or unmount context blocks on that session
3. send tasks into the global scheduler
4. inspect tasks and read event streams
5. archive or inspect structured session artifacts

The older single-run story (`load_context`, `run_subagent`, `archive_result`) is no longer the supported public tool interface.

## Extension Tool Surface

The default export registers one tool:

- `block_agent_core`

Supported actions:

- `create_session`
- `get_session`
- `list_sessions`
- `update_session`
- `mount_context`
- `unmount_context`
- `list_context_mounts`
- `send_task`
- `get_task`
- `list_tasks`
- `read_events`
- `list_models`
- `archive_session`

### `create_session`

Create a session directory and its base configuration.

Important inputs:

- `sessionId`
- `systemPromptFilePaths`
- `sdkMode`
- optional `modelSelection`
- optional `tools`
- optional `sdkOptions`

### `mount_context`

Append mounted context blocks to a session.

Important inputs:

- `sessionId`
- `sources`

### `update_session`

Update an existing session without rebuilding it.

Important inputs:

- `sessionId`
- optional `systemPromptFilePaths`
- optional `modelSelection`
- optional `tools`
- optional `sdkOptions`

### `unmount_context`

Remove mounted context blocks by mount id.

Important inputs:

- `sessionId`
- `mountIds`

### `send_task`

Register one task for a session. The scheduler decides whether it runs immediately or waits in the FIFO queue.

Important inputs:

- `sessionId`
- `taskId`
- `inputText`
- optional `temporarySources`

### `get_task` / `list_tasks`

Inspect task state, timestamps, queue position, model, and tools.

### `read_events`

Read the persisted JSONL event stream for a session or task.

### `list_models`

List PI models from either the host environment or standalone SDK mode.

### `archive_session`

Append messages, tool calls, or file calls directly into the session archive.

## Session Storage

Each session is rooted under:

```text
.block-agent-core/sessions/<sessionId>/
```

Core files:

- `messages.jsonl`
- `tool-calls.jsonl`
- `file-calls.jsonl`
- `system-prompts.json`

Runtime files:

- `tasks.jsonl`
- `events.jsonl`

## Context Assembly

Context assembly remains caller-directed.

Built-in source types:

- `jsonl-fields`
- `file`

`jsonl-fields` supports:

- explicit field selection
- numeric `sequence` range loading
- tag-based filtering
- optional expansion of message references into tool/file payloads

System prompts are automatically prepended on every task run and cannot be unmounted.

## Scheduler Behavior

- Global max concurrency: `8`
- Queue policy: FIFO
- Concurrency occurs across different sessions
- One session can only have one running task at a time
- First version exposes persistent event streams instead of in-process hooks
- First version does not support cancel

## SDK Modes

### `host-inherit`

Reuse the host PI environment:

- host model registry
- current model
- existing auth environment

### `standalone-sdk`

Use explicit SDK and auth inputs from `sdkOptions`.

This avoids silently depending on the user's current PI installation or default key selection.

## Important Core Exports

Recommended exports for new work:

- `createSession`
- `readSessionConfig`
- `mountContext`
- `unmountContext`
- `createSessionTask`
- `executeSessionTask`
- `TaskScheduler`
- `composeContext`
- `loadContextSource`
- `createContextLoaderRegistry`
- `runSubagentWithPiSdk`
- `listPiModels`

## Development

```bash
bun test
bunx tsc --noEmit
```
