# Better Subagent — LLM 代理用户手册

本手册介绍如何使用和理解 better-subagent 项目。目标读者是需要调用、修改或扩展此插件的 LLM 代理。

---

## 项目是什么

better-subagent 是一个**对话记忆数据库（Dialogue Memory Database）**。它提供结构化的对话持久化能力：将对话轮次（turns）、工具调用记录（tool calls）、模板（templates）、文件引用（file refs）和调用记录（call records）以 JSONL 格式存储，支持 CRUD 操作。此外，它提供基于配方的提示词拼装（prompt building）。

---

## 架构总览

项目采用扁平化两层结构（`core/` + `tool/` + `utils/`），入口文件 `index.ts` 支持双导出：

```
index.ts                 # 入口：双导出（PI 扩展 + 核心 API）
├── core/                # 核心层 — 纯函数，零 PI 依赖
│   ├── crud-factory.ts  #   泛型 CRUD 工厂（消除 5 模块重复）
│   ├── types.ts         #   共享类型（TurnInput/Record 等）
│   ├── turns.ts         #   对话轮次 CRUD（基于 crud-factory）
│   ├── tool-calls.ts    #   工具调用记录 CRUD（基于 crud-factory）
│   ├── templates.ts     #   模板 CRUD（基于 crud-factory）
│   ├── file-refs.ts     #   文件引用 CRUD（基于 crud-factory）
│   ├── call-records.ts  #   调用记录 CRUD（基于 crud-factory）
│   ├── recipes.ts       #   组装方案（TOML）
│   ├── build-prompt.ts  #   提示词拼装
│   └── save-turn.ts     #   一键保存编排
├── utils/               # 工具层
│   ├── jsonl.ts         #   JSONL 读写（原子写入）
│   ├── glob.ts          #   Glob 模式匹配
│   └── toml.ts          #   TOML 读写
├── tool/                # PI 集成层
│   ├── dialogue-memory.ts  # 工具注册（dialogue_memory）
│   └── actions/            # 动作处理（load/save/query/manage）
├── skills/              # PI skill 定义
└── docs/                # 文档
```

**Execution flow:**
```
用户调用工具 → index.ts 验证参数 → 分发到动作处理程序
→ 动作处理程序调用核心函数
→ 核心函数通过 utils/ 读写 JSONL/TOML 文件
→ 结果返回给用户
```

---

## 调用方式

### 默认导出（PI 扩展）

安装后，插件自动注册 `dialogue_memory` 工具，支持以下动作：

| 动作 | 说明 |
|------|------|
| `save` | 保存当前对话轮次 |
| `load` | 加载历史记录并构建 prompt |
| `query` | 查询各类记录（turns, tool calls 等） |
| `manage` | 管理配方和模板 |

### 命名导出（核心 API）

可以直接从 `index.ts` 导入以下函数：

| 函数 | 用途 |
|------|------|
| `saveTurn` | 原子保存轮次（写入 .md + 追加到 4 个 JSONL 表） |
| `appendTurn / getTurn / queryTurns / updateTurn` | 轮次 CRUD |
| `listTurns` | 列出所有轮次 |
| `findRecentTurns` | 获取最近 N 条轮次 |
| `appendToolCall / getToolCall / queryToolCalls / updateToolCall` | 工具调用 CRUD |
| `appendTemplate / getTemplate / queryTemplates / updateTemplate` | 模板 CRUD |
| `appendFileRef / getFileRef / queryFileRefs / updateFileRef` | 文件引用 CRUD |
| `appendCallRecord / getCallRecord / queryCallRecords / updateCallRecord` | 调用记录 CRUD |
| `loadRecipes / getRecipe / addRecipe / updateRecipe` | 配方 CRUD |
| `buildPrompt / buildPromptFromRecipe` | 提示词拼装 |

---

## 配方系统

配方（Recipes）定义了 prompt 的组装结构：

```toml
[[recipes]]
id = "default"
name = "Default"
description = "Standard setup"

[[recipes.zones]]
name = "config"
position = "before"
separator = ""

[[recipes.zones]]
name = "history"
position = "before"
separator_before = "---history---"
separator_after = "---end-history---"
```

`buildPrompt(recipePath, callRecord, resolver)` 按配方的 zone 配置拼装 prompt，各 zone 按 `position`（before/after）围绕 `{{CURRENT_TURN}}` 插入。`resolver` 回调将 `Ref` 引用解析为具体内容。

---

## 内部架构（简化后）

### 泛型 CRUD 工厂 (`core/crud-factory.ts`)

5 个长期重复的 CRUD 模块（turns、tool-calls、templates、file-refs、call-records）通过 `createCrudModule<Record, Input, Filter>(tableName, buildRecord, filterFn)` 统一。每个模块现在是工厂的薄 re-export 层，公开 API 完全不变。

**工厂方法：**

| 方法 | 签名 | 说明 |
|------|------|------|
| `append` | `(tablePath, id, input, extra?) => Promise<Record>` | 构建并写入记录 |
| `get` | `(tablePath, id) => Promise<Record \| null>` | 按 ID 查找 |
| `query` | `(tablePath, filter) => Promise<Record[]>` | 内置 ids 过滤 + 自定义 filterFn |
| `update` | `(tablePath, id, patch) => Promise<boolean>` | 原子更新 |
| `list` | `(tablePath) => Promise<Record[]>` | 读取全部 |

### 注册表模式 (`tool/actions/`)

`manage.ts` 和 `query.ts` 用**注册表对象**替代了巨大的 switch 语句：

- **`manage.ts`**：`registry[tableName][op]` — 6 个表 × 4 种操作。
  - `jsonlHandlers()` 工厂为 JSONL 表生成 get/append/update/delete 处理器
  - `recipes` 表（TOML 存储）注册特化的处理器
  - 新增表只需在 registry 加一个条目
- **`query.ts`**：`queryRegistry[tableName]` — 每个表直接映射到查询函数

### saveTurn 参数分组

`saveTurn()` params 支持两种格式：
- **Flat**（原）：14 个独立字段，如 `turnsPath`、`turnId` 等
- **Grouped**（新）：`{ paths: { turnsPath, turnMdPath, ... }, ids: { turnId, toolCallIds, ... }, ... }`

两种格式完全兼容。`normalizeParams()` 内部统一转换。

### `ok(text)` 辅助函数

所有 tool action handler 使用 `ok(text)` 辅助函数返回 `{ content: [{ type: "text", text }], details: {} }`，消除了约 30 处样板代码。

---

## 关键约束

- `core/` 模块零 PI 依赖、零 I/O — I/O 通过 `utils/` 委托
- JSONL 文件使用原子写入（.tmp + rename）确保崩溃安全
- `tsconfig` 启用 `exactOptionalPropertyTypes` 和 `verbatimModuleSyntax`

---

## 延伸阅读

- **用户手册（英文）**：`docs/user-manual.md` — 完整的项目使用指南
- **L1 文件文档**：`docs/L1-files/` — 按文件的源码级文档，含行号引用
  - `core-crud-factory.md` — 泛型 CRUD 工厂
  - `core-save-turn.md` — save-turn 编排器
  - `tool-actions-load.md` — load 动作处理
  - `tool-actions-manage.md` — manage 动作处理（注册表模式）
  - `tool-actions-query.md` — query 动作处理（注册表模式）
  - `tool-actions-save.md` — save 动作处理
  - `tool-dialogue-memory.md` — 工具注册
