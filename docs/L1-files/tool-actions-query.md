# tool/actions/query.ts

## 作用

处理 `dialogue_memory` 工具 `action: "query"` — 查询六表（turns/toolCalls/templates/fileRefs/callRecords/recipes）。

依赖：各 CRUD 模块的 query* 函数（`queryTurns`、`queryToolCalls` 等）。

## 导出符号

| 符号 | 行号 | 说明 |
|------|------|------|
| `handleQuery(params, ctx)` | 33-49 | 主 handler — 从注册表中查找查询函数 → 执行 → 返回结果 |

### 注册表

`queryRegistry[tableName]` 将每个表名映射到对应的查询函数。recipes 表特殊处理（调用 `loadRecipes` 后做 id 过滤），其余 5 个表直接调用对应的 `query*` 函数。

### 内部流程

| 步骤 | 行号 | 说明 |
|------|------|------|
| 查找查询函数 | 37-40 | 从 `queryRegistry` 按 table 查找 |
| 执行查询 | 41 | `qf(tablePath, filter)` |
| 格式化返回 | 42-48 | 拼接结果计数 + JSON 序列化 |
