# core/crud-factory.ts

## 作用

泛型 CRUD 工厂 — 消除 5 个模块（turns/tool-calls/templates/file-refs/call-records）中重复的 append/get/query/update 骨架代码。

依赖：`../utils/jsonl.ts`。

## 导出符号

| 符号 | 行号 | 说明 |
|------|------|------|
| `createCrudModule<Record, Input, Filter>(tableName, buildRecord, filterFn)` | 15-94 | 返回 `{ append, get, query, update, list }` 对象 |

### 工厂方法详情

| 方法 | 内部流程 |
|------|---------|
| `append` | 调用 `buildRecord(id, input, extra)` 构建记录 → `appendJsonl` 写入 |
| `get` | `readJsonl` 读取全部 → `find(r => r.id === id)` |
| `query` | `readJsonl` 读取 → 内置 ids 过滤（可选）→ 调用 `filterFn` 进一步过滤 |
| `update` | 委托 `updateJsonl`（按 id 查找 → patch → 原子重写） |
| `list` | 直接 `readJsonl` 返回全部记录（不经过 filterFn） |

### 各模块的 buildRecord / filterFn

| 模块 | buildRecord | filterFn |
|------|-------------|----------|
| `turns` | `{ id, path: extra as string, handoff: input.userText.slice(0,80), tags }` | tags 匹配（OR 逻辑） |
| `tool-calls` | `{ id, turnId, toolName, params, content, details, truncated, error, durationMs }` | turnId/toolName 匹配 |
| `templates` | `{ id, path: extra as string, tags }` | tags 匹配（OR 逻辑） |
| `file-refs` | `{ id, filePath, turnId, toolCallId, accessType, handoff }` | turnId/accessType/filePath（glob）匹配 |
| `call-records` | `{ id, turnId, recipeId, zones }` | turnId/recipeId 匹配 |
