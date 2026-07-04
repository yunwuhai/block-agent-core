# Block Agent Core 使用手册

`better-subagent` 现在应被理解为一个面向 PI Coding Agent 的 `block_agent_core` 扩展，而不是旧的对话记忆数据库工具。

## 对外动作

当前正式动作只有四个：

- `load_context`
- `run_subagent`
- `list_models`
- `archive_result`

旧的 `load / save / query / manage` 不再作为正式扩展接口保留。

## 推荐流程

1. 用 `load_context` 组装上下文块
2. 用 `run_subagent` 指定输入文本、模型、工具和轮次标识并执行
3. 用默认归档模块保存 reasoning / reply / tool calls / external files

## 关键模块

- `core/context-sources.ts`
- `core/subagent-run.ts`
- `core/pi-config.ts`
- `adapter/pi-sdk.ts`
- `core/archive-store.ts`

## 默认归档

默认归档目录为：

```text
.block-agent-core/runs/<runId>/
```

默认产物包括：

- `messages.jsonl`
- `tool-calls/<id>.json`
- `external-files.jsonl`
