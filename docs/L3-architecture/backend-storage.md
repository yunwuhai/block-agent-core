# L3 Architecture: Backend — 存储 (Storage)

Backend storage owns durable run data and registry persistence.

## Member Modules

| # | Module | Primary | Description | L2 Doc |
|---|--------|---------|-------------|--------|
| 1 | `durable-run-storage` | 存储 | Run directory lifecycle, JSONL event/tool/session logging, search, and cleanup. | [durable-run-storage.md](../L2-modules/durable-run-storage.md) |
| 2 | `registry-storage` | 存储 | JSONL-backed Prompt Registry entries, call history, indexes, and frequency state. | [registry-storage.md](../L2-modules/registry-storage.md) |

## Run Data Model

```
.pi/subagents/runs/
└── {profile}-{task}-{timestamp}-{suffix}/
    ├── session.json
    ├── events.jsonl
    ├── session.jsonl
    ├── tools.jsonl
    ├── transcript.md
    └── .handoff.md
```

The storage layer records explicit action execution, policy blocks, prompt slot mutations, and artifact paths in a searchable JSONL format.
