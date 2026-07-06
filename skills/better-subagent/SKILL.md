# Block Agent Core Skill

Use this skill when you want to manage a persistent PI-backed session instead of making one-off subagent calls.

## Best fit

- You want to keep history across multiple sends.
- You want to mount and unmount context blocks over time.
- You want structured archives in JSONL files.
- You want to inspect event logs after a send.

## Preferred actions

### `create_session`

Create one persistent session with:

- `sessionId`
- `systemPromptFilePaths`
- `sdkMode`
- optional `modelSelection`
- optional `tools`

### `mount_context`

Use when you want to add context before the next send.

Supports:

- `sources`
- `seqRanges`

### `unmount_context`

Use when you want to remove active history.

Prefer:

- `seqRanges`

Compatibility cleanup is still possible with:

- `mountIds`

### `send_message`

Use when you want to append one new input and run the session.

Typical fields:

- `sessionId`
- `inputText`
- optional `temporarySources`

### `read_events`

Use when you want to inspect lifecycle and tool activity.

You can filter by:

- `sessionId`
- optional `turnId`

## Storage model

- `messages.jsonl` is the only context mainline (tool and file data inlined)
- `events.jsonl` stores compact audit events
- `system-config.json` stores fixed prompts and default PI settings
