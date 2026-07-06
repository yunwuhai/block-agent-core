# tool/ — MCP 工具层

`block_agent_core` 工具的注册、路由、action 处理器。

---

## 文件清单

### `block-agent-core.ts` — 工具路由注册

| 导出 | 说明 |
|------|------|
| `registerBlockAgentCoreTool` | 注册 `block_agent_core` MCP 工具。根据 `action` 参数路由到对应的 handler：`create_session`、`get_session`、`list_sessions`、`update_session`、`send_message`、`mount_context`、`unmount_context`、`list_context_mounts`、`read_events`、`list_models`、`archive_session` |

### `shared.ts` — 共享类型与工具函数

| 导出 | 说明 |
|------|------|
| `ExtensionContextLike` | 扩展上下文接口（cwd、modelRegistry、model、authStorage、piSdkModule） |
| `ToolResponse` | 工具响应结构（content + details） |
| `ok` | 成功响应工厂函数 |
| `error` | 错误响应工厂函数 |

### `actions/` — Action 处理器目录

| 文件 | action | 说明 |
|------|--------|------|
| `archive-session.ts` | `archive_session` | 归档会话消息至静态存储 |
| `context-mounts.ts` | `mount_context` / `unmount_context` | 上下文挂载与卸载 |
| `create-session.ts` | `create_session` / `get_session` / `list_sessions` | 会话创建与查询 |
| `list-models.ts` | `list_models` | 列出可用模型（支持 host-inherit 和 standalone-sdk） |
| `read-events.ts` | `read_events` | 读取会话事件（支持按 turnId 过滤） |
| `send-task.ts` | `send_message` | 发送消息并执行（含调度器排队） |
| `update-session.ts` | `update_session` | 更新会话配置（prompt、model、tools、sdkMode） |
