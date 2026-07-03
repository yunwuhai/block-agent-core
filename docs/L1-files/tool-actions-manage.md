# tool/actions/manage.ts

## 作用

处理 `dialogue_memory` 工具 `action: "manage"` — 六表（turns/toolCalls/templates/fileRefs/callRecords/recipes）的 get/append/update/delete 操作。

依赖：`../../utils/jsonl.ts`，各 CRUD 模块的 get/append/update 函数。

## 导出符号

| 符号 | 行号 | 说明 |
|------|------|------|
| `handleManage(params, ctx)` | 108-127 | 主 handler — 查找注册表 → 执行操作 → 返回结果 |

### 注册表模式

`registry[tableName][op]` 结构消除了原 24 个 case 的 switch：

| 部分 | 行号 | 说明 |
|------|------|------|
| `jsonlHandlers(label, getFn, updateFn, appendFn)` | 36-60 | 工厂函数，为 JSONL 表生成 `{ get, append, update, delete }` |
| `registry` | 65-103 | 6 个表名的处理器映射 |
| `handleManage` 分发逻辑 | 112-126 | UI 确认（可选）→ 查 registry → 调用 → 统一 try/catch |

### 表特殊性

- **JSONL 表**（5 个）：通过 `jsonlHandlers` 工厂生成，delete 委托 `deleteJsonl`
- **recipes 表**：TOML 存储，独立注册 get/append/update（无 delete）
- **turns/templates**：append 时需额外 path 参数（`turnMdPath` / `templateMdPath`）
