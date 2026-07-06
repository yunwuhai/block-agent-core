# turn/ — Turn 系统（遗留模块）

基于回合的记录模型，管理模板、配方、工具调用记录。与 session 系统独立，无耦合。

> **注意**：此模块为遗留系统。新功能应基于 `session/` 模块构建。

---

## 文件清单

### `types.ts` — Turn 系统核心类型定义

| 导出 | 说明 |
|------|------|
| `ContentBlock` | 内容块类型（`"text"` / `"image"`） |
| `TurnInput` | 回合输入（userText、assistantBlocks、tags） |
| `AssistantBlock` | AI 回复块（text 或 tool 类型） |
| `TurnRecord` | 回合记录（id、path、handoff、tags） |
| `TurnFilter` | 回合过滤条件 |

### `crud-factory.ts` — 通用 CRUD 工厂

| 导出 | 说明 |
|------|------|
| `createCrudModule` | 创建通用 CRUD 模块（消除 5 个模块的重复代码）。提供 `append`、`get`、`query`、`update`、`list`、`delete` 方法。 |

通过向 `createCrudModule` 传入 `buildRecord`（记录构造器）和 `filterFn`（过滤函数），即可快速生成针对特定类型的增删改查模块。

### `turns.ts` — 回合记录 CRUD

| 导出 | 说明 |
|------|------|
| `appendTurn` | 追加回合记录 |
| `getTurn` | 按 ID 获取回合 |
| `queryTurns` | 按过滤条件查询回合 |
| `updateTurn` | 更新回合 |
| `listTurns` | 列出所有回合 |

### `save-turn.ts` — 回合保存

| 导出 | 说明 |
|------|------|
| `formatTurnId` | 格式化回合 ID（`turn-NNN`） |
| `assembleTurnMd` | 组装回合 Markdown 文档（User → Assistant 对话格式） |
| `saveTurn` | 保存完整回合（Markdown + JSONL 记录 + 工具调用 + 文件引用 + 调用记录） |

### `tool-calls.ts` — 工具调用记录 CRUD

| 导出 | 说明 |
|------|------|
| `appendToolCall` | 追加工具调用记录 |
| `getToolCall` | 按 ID 获取工具调用 |
| `queryToolCalls` | 按过滤条件查询工具调用 |
| `updateToolCall` | 更新工具调用 |
| `listToolCalls` | 列出所有工具调用 |

### `file-refs.ts` — 文件引用记录 CRUD

| 导出 | 说明 |
|------|------|
| `appendFileRef` | 追加文件引用 |
| `getFileRef` | 按 ID 获取文件引用 |
| `queryFileRefs` | 按过滤条件查询（支持 turnId、accessType、filePath glob） |
| `updateFileRef` | 更新文件引用 |
| `listFileRefs` | 列出所有文件引用 |

### `call-records.ts` — 调用记录 CRUD

| 导出 | 说明 |
|------|------|
| `appendCallRecord` | 追加调用记录 |
| `getCallRecord` | 按 ID 获取调用记录 |
| `queryCallRecords` | 按过滤条件查询（支持 turnId、recipeId） |
| `updateCallRecord` | 更新调用记录 |
| `listCallRecords` | 列出所有调用记录 |

### `templates.ts` — 模板记录 CRUD

| 导出 | 说明 |
|------|------|
| `appendTemplate` | 追加模板记录 |
| `getTemplate` | 按 ID 获取模板 |
| `queryTemplates` | 按过滤条件查询（支持 tags） |
| `updateTemplate` | 更新模板 |
| `listTemplates` | 列出所有模板 |

### `recipes.ts` — 配方 CRUD（TOML 文件）

| 导出 | 说明 |
|------|------|
| `loadRecipes` | 从 TOML 文件加载所有配方 |
| `getRecipe` | 按 ID 获取单个配方 |
| `addRecipe` | 添加新配方到 TOML 文件 |
| `updateRecipe` | 更新已有配方 |

配方以 TOML 文件格式存储，支持 `id`、`zones`（zone 数组）等字段。

### `build-prompt.ts` — 配方驱动的提示词构建

| 导出 | 说明 |
|------|------|
| `resolveZone` | 根据 zone 定义和 ref 列表解析区段内容 |
| `buildPromptFromRecipe` | 根据配方和调用记录构建完整提示词（按 `before` / `after` 位置组装 zone） |
