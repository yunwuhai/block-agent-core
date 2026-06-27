# tool/dialogue-memory.ts

## 作用

对话记忆数据库的 PI 工具注册入口。注册 `dialogue_memory` 工具（四个 action：load/save/query/manage），同时注册 `tool_call` 事件拦截器以实现文件级权限沙箱。

依赖：`./actions/load.ts`, `./actions/save.ts`, `./actions/query.ts`, `./actions/manage.ts`, `./permissions.ts`。

## 导出符号

| 符号 | 行号 | 说明 |
|------|------|------|
| `registerDialogueMemoryTool(pi)` | 11-108 | 注册 `dialogue_memory` 工具和 `tool_call` 权限拦截器 |

### `registerDialogueMemoryTool` 内部结构

| 部分 | 行号 | 说明 |
|------|------|------|
| `tool_call` 事件拦截器 | 16-35 | 拦截 read/write/edit 工具调用，通过 `checkRead`/`checkWrite` 检查路径权限，不匹配时返回 `{ block: true, reason }` |
| `dialogue_memory` 工具注册 | 37-107 | TypeBox 参数 schema + execute 分发到四个 action handler |
