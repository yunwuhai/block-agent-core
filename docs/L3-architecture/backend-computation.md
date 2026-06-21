# L3 Architecture: Backend — 计算 (Computation)

Backend computation contains deterministic logic: policy decisions, prompt composition, and registry scheduling/resolution.

## Member Modules

| # | Module | Primary | Description | L2 Doc |
|---|--------|---------|-------------|--------|
| 1 | `registry-types` | 计算 | Shared Prompt Registry contracts: entries, calls, schedules, lifecycle/frequency config. | [registry-types.md](../L2-modules/registry-types.md) |
| 2 | `registry-engine` | 计算 | Registry resolution and scheduling pipeline. | [registry-engine.md](../L2-modules/registry-engine.md) |
| 3 | `registry-composer` | 计算 / 输出 | Assembles the final prompt from ToC, scheduled entries, and placeholders. | [registry-composer.md](../L2-modules/registry-composer.md) |
| 4 | `prompt-engine` | 计算 | Stateful prompt rendering, placeholders, dynamic slots, serialization. | [prompt-engine.md](../L2-modules/prompt-engine.md) |
| 5 | `policy-engine` | 计算 | Merges and evaluates tool, path, command, network, env, and subagent permissions. | [policy-engine.md](../L2-modules/policy-engine.md) |
## Current Boundary

This project no longer has a lifecycle extension subsystem. Tool execution is controlled by explicit action parameters and policy evaluation. Prompt/context injection is handled through profile placeholders, dynamic prompt slots, and the Prompt Registry.

The computation layer therefore supports the two intended capabilities:

1. Subagent parameter control through profile frontmatter, JSON/JSONL registry data, project policy, and explicit action parameters.
2. Durable, schedulable conversation context through registry scheduling, prompt rendering, run artifacts, and searchable logs.

## Data Flow

```
Profile + project policy
        │
        ├── policy-engine ──► allow/block action
        │
        └── prompt-engine
              └── registry-composer
                    └── registry-engine
                          └── registry-storage
```
