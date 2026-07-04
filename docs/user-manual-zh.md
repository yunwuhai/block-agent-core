# Block Agent Core 使用手册

## 项目定位

`block_agent_core` 现在是一个面向 PI Coding Agent 的 session-first 运行时扩展。

它的正式工作流不再是“临时拼一次上下文然后跑一次子代理”，而是：

1. 创建持久 session
2. 在 session 上挂载或卸载上下文块
3. 向 session 发送 task
4. 由全局调度器安排执行
5. 通过 JSONL 归档和事件流持续观察结果

旧的 `load_context / run_subagent / archive_result` 已不再是正式公开接口。

## 对外动作

正式工具名：

- `block_agent_core`

正式动作：

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

## Session 结构

每个 session 位于：

```text
.block-agent-core/sessions/<sessionId>/
```

四个核心文件：

- `messages.jsonl`
- `tool-calls.jsonl`
- `file-calls.jsonl`
- `system-prompts.json`

运行时附加文件：

- `tasks.jsonl`
- `events.jsonl`

其中：

- `messages.jsonl` 作为主轴，按 `sequence` 顺序保存 reasoning、reply、工具引用、文件引用等消息
- `tool-calls.jsonl` 顺序保存工具调用
- `file-calls.jsonl` 顺序保存文件访问与文件引用
- `system-prompts.json` 保存固定 system prompts、模型选择、工具选择和 SDK 模式
- `update_session` 可以直接改动 session 的模型、工具、SDK 参数和 system prompts，而不重建 session

## 上下文加载

项目只提供“如何加载”的能力，不提供“该加载什么”的策略。

内置 source：

- `jsonl-fields`
- `file`

`jsonl-fields` 目前支持：

- 显式字段选择
- 按 `sequence` 数字区间加载
- 按 `tags` 过滤
- 在消息记录中展开 tool/file 引用

system prompts 会在每轮 task 执行时自动前置，并且不可卸载。

## 调度器

调度规则固定为：

- 全局最多同时运行 `8` 个 task
- 超出后进入 FIFO 队列
- 并发只发生在不同 session 之间
- 同一 session 同时只允许 `1` 个 running task

第一版 hook 形态是持久化事件流：

- `task_registered`
- `task_queued`
- `task_started`
- `tool_call_started`
- `tool_call_finished`
- `task_completed`
- `task_failed`

第一版不支持 cancel。

## SDK 模式

### `host-inherit`

复用宿主 PI 环境：

- model registry
- 当前模型
- 宿主认证环境

### `standalone-sdk`

通过 `sdkOptions` 显式指定 SDK / auth 来源，避免隐式依赖用户当前 PI 安装或默认 key。

## 推荐导出

推荐优先使用的新核心能力：

- `createSession`
- `readSessionConfig`
- `mountContext`
- `unmountContext`
- `createSessionTask`
- `executeSessionTask`
- `TaskScheduler`
- `composeContext`
- `loadContextSource`
- `createContextLoaderRegistry`
- `runSubagentWithPiSdk`
- `listPiModels`

## 开发命令

```bash
bun test
bunx tsc --noEmit
```
