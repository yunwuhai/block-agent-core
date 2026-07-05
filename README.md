# Block Agent Core

`block-agent-core` is a session-first runtime for PI Coding Agent.

It centers on:

- persistent `session`s
- `messages.jsonl` as the only context mainline (tool and file data inlined)
- `events.jsonl` as a lightweight audit log
- `seq`-driven history mount / unmount

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
- `send_message`
- `read_events`
- `list_models`
- `archive_session`

`send_task` is kept only as a compatibility alias for `send_message`.

## Session Files

Each session stores:

- `messages.jsonl`
- `events.jsonl`
- `system-config.json`

Message kinds:

- `input`
- `reasoning`
- `reply`
- `tool_call`
- `file_call`

Notes:

- `tool_call` messages carry tool name, params, result, and error inline
- `file_call` messages carry the referenced file path inline
- system prompt is stored in `system-config.json` and passed to the PI SDK at send time
- active history is tracked by `seq` ranges, not by round/task tables

## Context Loading

Built-in source types:

- `jsonl-fields`
- `file`

`jsonl-fields` supports:

- explicit field selection
- `seq` range loading
- tag filtering
- optional tool/file reference expansion

Custom loaders can still be registered.

## Development

```bash
bun test
bunx tsc --noEmit
```
