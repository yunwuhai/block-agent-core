# Efficiency Subagent

Lightweight controllable subagent plugin for PI Coding Agent. Profile-based invocation with durable sessions, structured handoff, dynamic prompt slots, hook scripts, permission enforcement, and live TUI events.

## Features

- **Profile-based invocation**: invoke subagents by profile name plus task
- **Durable sessions**: every run creates `.pi/subagents/runs/<run-id>/` with JSONL facts, tool logs, transcript, and handoff
- **Structured handoff**: generated after hooks complete, appended at a stable location
- **Dynamic prompt slots**: set, clear, list, push, pop, once, and TTL operations; all mutations logged
- **Hook scripts**: execute before/after agent and tool calls; output injected through prompt slots
- **Permission enforcement**: strong blocking for tool names, file paths, bash commands, network access, env vars, and nested subagent calls
- **Live TUI events**: compact and expandable event rendering

## Install

```bash
rm -rf ~/.pi/agent/extensions/efficiency-subagent
ln -s "$(pwd)/efficiency-subagent" ~/.pi/agent/extensions/efficiency-subagent
```

Or load ad-hoc:

```bash
pi --extension ./efficiency-subagent/index.ts "Use efficiency subagent with profile worker, task 'list files'"
```

## Usage

```json
{
  "profile": "worker",
  "task": "Implement the login endpoint"
}
```

Optional:

```json
{
  "profile": "worker",
  "task": "Continue previous work",
  "runId": "abc123def456"
}
```

## Directory layout

```
efficiency-subagent/
├── index.ts              Extension entry point, registers "efficiency_subagent" tool
├── config/               Tool params schema, profile/project config types
├── storage/              JSONL event log, run directories, handoff, transcript
├── runtime/
│   ├── runner.ts         Orchestrates profile+task run with policy/hooks/slots
│   ├── prompt-slots/     Dynamic slot engine
│   └── hooks/            Script runner and slot insertion
├── policy/               Policy merge and evaluator (files/bash/network/env/subagent)
├── display/              TUI event formatting
└── tests/                Test harness
```

## Testing

```bash
cd efficiency-subagent
bun test tests/
```

Requires `bun`, `zod`, and access to `@earendil-works/pi-coding-agent` (symlinked from PI global install).

## Real surface QA

```bash
pi --extension ./efficiency-subagent/index.ts --mode json -p "Use efficiency subagent with profile test, task smoke"
```

Requires configured API credentials. Without them, the full test suite provides equivalent coverage.

## Not included

- No workflow engine
- No planner-router graph orchestration
- No OS/container sandbox (MVP uses PI extension-level guard)
- No bundled profiles (user config only)
