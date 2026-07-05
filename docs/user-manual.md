# Block Agent Core User Manual

## Positioning

`block_agent_core` is a session-first PI extension.

The normal workflow is:

1. Create a persistent session.
2. Mount source context or historical `seq` ranges.
3. Send one new input message.
4. Let the scheduler run the send.
5. Inspect archives and event logs.

## Public Actions

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

`send_task` remains only as a compatibility alias.

## Session Layout

Each session lives under:

```text
.block-agent-core/sessions/<sessionId>/
```

Runtime files:

- `messages.jsonl`
- `tool-calls.jsonl`
- `file-calls.jsonl`
- `events.jsonl`
- `system-config.json`

`messages.jsonl` is the only context mainline and uses `seq` plus `parentSeq`.

## Message Model

Supported message kinds:

- `system_prompt`
- `input`
- `reasoning`
- `reply`
- `tool_call`
- `file_call`

Rules:

- system prompt text is materialized into `messages.jsonl` before each send
- the first input of a send points to the last system prompt message
- tool call messages reference `tool-calls.jsonl` and expand both call and result
- file call messages reference `file-calls.jsonl`
- system prompt messages are not removed by normal unload operations

## Context Mounting

`mount_context` supports:

- source mounts via `sources`
- historical remount via `seqRanges`

`unmount_context` supports:

- unloading active history by `seqRanges`
- optional compatibility cleanup by `mountIds`

Active context is derived from:

- the latest `send_finished` snapshot
- later `manual_mount` / `manual_unmount` events
- message parent links

No separate task table or round table is maintained.

## Events

`events.jsonl` is an audit log, not a hook system.

Main event types:

- `session_initialized`
- `session_config_updated`
- `manual_mount`
- `manual_unmount`
- `send_enqueued`
- `send_started`
- `send_finished`
- `tool_send_started`
- `tool_send_finished`

`read_events` can filter by `requestKey`.

## SDK Modes

### `host-inherit`

Reuses the host PI runtime, model registry, and auth environment.

### `standalone-sdk`

Uses explicit SDK and auth settings from `sdkOptions`.

## Commands

```bash
bun test
bunx tsc --noEmit
```
