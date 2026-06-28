# tool/dialogue-memory.ts

## 作用

对话记忆数据库的 PI 工具注册入口。注册 `dialogue_memory` 工具（四个 action：load/save/query/manage）。

依赖：`./actions/load.ts`, `./actions/save.ts`, `./actions/query.ts`, `./actions/manage.ts`。

## 导出符号

| 符号 | 行号 | 说明 |
|------|------|------|
| `registerDialogueMemoryTool(pi)` | 9-82 | 注册 `dialogue_memory` 工具 |

### `registerDialogueMemoryTool` 内部结构

| 部分 | 行号 | 说明 |
|------|------|------|
| `dialogue_memory` 工具注册 | 10-81 | TypeBox 参数 schema + execute 分发到四个 action handler |
