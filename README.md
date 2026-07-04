# Block Agent Core

`block-agent-core` is now a session-first runtime for PI Coding Agent.

Instead of treating every subagent run as a standalone call, it manages:

- persistent sessions
- mounted context blocks
- queued tasks
- structured message / tool / file archives
- JSONL event streams

## Public Tool

The extension registers one tool:

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

## Core Model

- A `session` is a persistent runtime unit with fixed system prompts and default PI settings.
- A `task` is one input sent to a session.
- The scheduler runs tasks across sessions with a global max concurrency of `8`.
- The same session never runs two tasks at the same time.
- `update_session` changes model, tool, or system prompt config without recreating the session.

Each session stores:

- `messages.jsonl`
- `tool-calls.jsonl`
- `file-calls.jsonl`
- `system-prompts.json`

Additional runtime state is stored in:

- `tasks.jsonl`
- `events.jsonl`

## Context Loading

The project provides loading primitives, not loading policy.

Built-in source types:

- `jsonl-fields`
- `file`

`jsonl-fields` supports:

- field-based loading
- sequence ranges
- tag filtering
- optional tool/file reference expansion

Custom loaders can still be registered.

## Development

```bash
bun test
bunx tsc --noEmit
```
