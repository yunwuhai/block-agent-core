# Block Agent Core 使用手册

## 项目定位

`block_agent_core` 是一个以 session 为中心的 PI 扩展。

标准工作流是：

1. 创建持久 session
2. 挂载外部上下文或历史 `seq` 区间
3. 发送一条新的输入消息
4. 由调度器执行本次 send
5. 通过归档文件和事件日志检查结果

## 对外动作

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

`send_task` 只保留为兼容别名，不再是主叙事接口。

## Session 目录结构

每个 session 位于：

```text
.block-agent-core/sessions/<sessionId>/
```

正式运行时文件：

- `messages.jsonl`
- `tool-calls.jsonl`
- `file-calls.jsonl`
- `events.jsonl`
- `system-config.json`

其中 `messages.jsonl` 是唯一上下文主轴，使用 `seq` 和 `parentSeq` 表示顺序与分支连接。

## Message 模型

支持的 message kind：

- `system_prompt`
- `input`
- `reasoning`
- `reply`
- `tool_call`
- `file_call`

规则：

- 每次实际发送前，system prompt 文本会先实体化写入 `messages.jsonl`
- 本轮第一条 `input` 的 `parentSeq` 指向最后一条 `system_prompt`
- `tool_call` message 会展开同一条工具调用的参数和结果
- `file_call` message 会引用 `file-calls.jsonl`
- `system_prompt` message 默认不可被普通卸载移除

## 上下文挂载

`mount_context` 支持两类挂载：

- 通过 `sources` 挂入外部上下文
- 通过 `seqRanges` 重新挂回历史 message 区间

`unmount_context` 支持：

- 用 `seqRanges` 卸载当前有效历史
- 用 `mountIds` 做兼容性的 source mount 清理

当前有效上下文集合通过以下信息动态推导：

- 最新 `send_finished` 快照
- 之后的 `manual_mount` / `manual_unmount` 事件
- messages 的 `parentSeq` 链接

项目不再维护独立的 task 表或 round 表。

## 事件日志

`events.jsonl` 是审计日志，不是 hook。

主要事件类型：

- `session_initialized`
- `session_config_updated`
- `manual_mount`
- `manual_unmount`
- `send_enqueued`
- `send_started`
- `send_finished`
- `tool_send_started`
- `tool_send_finished`

`read_events` 可以按 `requestKey` 过滤。

## SDK 模式

### `host-inherit`

继承宿主 PI 的运行时、模型注册表和认证环境。

### `standalone-sdk`

通过 `sdkOptions` 显式提供 SDK 路径和认证来源。

## 开发命令

```bash
bun test
bunx tsc --noEmit
```
