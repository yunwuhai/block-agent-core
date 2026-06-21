# L3 Architecture: Module Classification

Current classification of L2 modules by primary architectural purpose.

| # | Module | Primary | Secondary | L2 Doc |
|---|--------|---------|-----------|--------|
| 1 | `configuration` | 输入 | — | [configuration.md](../L2-modules/configuration.md) |
| 2 | `profile-management` | 输入 | — | [profile-management.md](../L2-modules/profile-management.md) |
| 3 | `project-policy` | 输入 | — | [project-policy.md](../L2-modules/project-policy.md) |
| 4 | `durable-run-storage` | 存储 | — | [durable-run-storage.md](../L2-modules/durable-run-storage.md) |
| 5 | `registry-storage` | 存储 | — | [registry-storage.md](../L2-modules/registry-storage.md) |
| 6 | `run-artifact-generation` | 输出 | — | [run-artifact-generation.md](../L2-modules/run-artifact-generation.md) |
| 7 | `registry-types` | 计算 | — | [registry-types.md](../L2-modules/registry-types.md) |
| 8 | `registry-engine` | 计算 | — | [registry-engine.md](../L2-modules/registry-engine.md) |
| 9 | `registry-composer` | 计算 | 输出 | [registry-composer.md](../L2-modules/registry-composer.md) |
| 10 | `prompt-engine` | 计算 | — | [prompt-engine.md](../L2-modules/prompt-engine.md) |
| 11 | `policy-engine` | 计算 | — | [policy-engine.md](../L2-modules/policy-engine.md) |
| 12 | `display-tui` | 显示 | — | [display-tui.md](../L2-modules/display-tui.md) |
| 13 | `runtime-core` | 操作 | 输入, 计算, 存储, 输出 | [runtime-core.md](../L2-modules/runtime-core.md) |
| 14 | `root-entry` | 操作 | 显示 | [root-entry.md](../L2-modules/root-entry.md) |

## Classification Notes

- Input modules parse and validate external data.
- Computation modules make decisions or compose prompt/context text.
- Storage modules own persisted JSONL and indexed registry data.
- Output modules format durable artifacts.
- Operation modules coordinate user-facing execution flow.
- Display modules format terminal output.
