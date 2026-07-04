---
name: block-agent-core
description: Manage persistent PI-backed sessions with mounted context blocks, queued tasks, JSONL archives, and event streams.
---

# Block Agent Core

Use the `block_agent_core` tool when you need a persistent external agent session instead of a one-shot subagent call.

## When to Use

- You want one session to keep fixed system prompts and default tool/model settings.
- You want to mount and unmount context blocks over time.
- You want multiple sessions to run tasks in parallel under a global scheduler.
- You want reasoning, replies, tool calls, file calls, and task lifecycle events archived in JSONL form.

## Main Actions

### `create_session`

Create a persistent session with:

- `sessionId`
- `systemPromptFilePaths`
- `sdkMode`
- optional `modelSelection`
- optional `tools`
- optional `sdkOptions`

### `mount_context`

Append mounted context sources to an existing session.

### `send_task`

Queue one task for a session.

Typical inputs:

- `sessionId`
- `taskId`
- `inputText`
- optional `temporarySources`

### `list_tasks` / `get_task`

Inspect queued, running, completed, or failed tasks.

### `read_events`

Read the persistent event stream for task lifecycle and tool execution updates.

### `archive_session`

Append manual messages, tool calls, or file calls into session storage.

## Key Constraints

- Context policy is caller-owned; the project only provides loading primitives.
- System prompts are always prepended on each task run.
- The same session does not run multiple tasks concurrently.
- Global concurrency is capped by the scheduler, not by the caller.
