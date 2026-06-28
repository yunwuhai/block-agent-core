# Better Subagent — LLM 代理用户手册

本手册介绍如何使用和理解 better-subagent 项目。目标读者是需要调用、修改或扩展此插件的 LLM 代理。

---

## 项目是什么

better-subagent 是一个**对话记忆数据库（Dialogue Memory Database）**。它提供结构化的对话持久化能力：将对话轮次（turns）、工具调用记录（tool calls）、模板（templates）、文件引用（file refs）和调用记录（call records）以 JSONL 格式存储，支持 CRUD 操作。此外，它提供基于配方的提示词拼装（prompt building）和文件级权限沙箱。

---

## 架构总览

项目采用扁平化两层结构（`core/` + `tool/` + `utils/`），入口文件 `index.ts` 支持双导出：

```
index.ts                 # 入口：双导出（PI 扩展 + 核心 API）
├── core/                # 核心层 — 纯函数，零 PI 依赖
│   ├── types.ts         #   共享类型（TurnInput/Record 等）
│   ├── turns.ts         #   对话轮次 CRUD
│   ├── tool-calls.ts    #   工具调用记录 CRUD
│   ├── templates.ts     #   模板 CRUD
│   ├── file-refs.ts     #   文件引用 CRUD
│   ├── call-records.ts  #   调用记录 CRUD
│   ├── recipes.ts       #   组装方案（TOML）
│   ├── build-prompt.ts  #   提示词拼装
│   └── save-turn.ts     #   一键保存编排
├── utils/               # 工具层
│   ├── jsonl.ts         #   JSONL 读写（原子写入）
│   ├── glob.ts          #   Glob 模式匹配
│   └── toml.ts          #   TOML 读写
├── tool/                # PI 集成层
│   ├── dialogue-memory.ts  # 工具注册（dialogue_memory）
│   ├── permissions.ts      # 文件级权限沙箱
│   └── actions/            # 动作处理（load/save/query/manage）
├── skills/              # PI skill 定义
├── .profiles/           # 用户定义的 profile
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
| `setPermissions / clearPermissions / checkRead / checkWrite / getPermissions` | 权限沙箱 |

### API 使用示例

```typescript
import { appendTurn, queryTurns, setPermissions } from "better-subagent";

// 保存一个轮次
await appendTurn(tablePath, "turn-001", "/path/to/turn.md", {
  userText: "Write a function to calculate fibonacci numbers",
  assistantBlocks: [{ type: "text", text: "..." }],
  tags: ["math"],
});

// 查询
const turns = await queryTurns(tablePath, { tags: ["math"] });

// 权限沙箱 — 位置形式
setPermissions(["/project/**"], ["/project/output/**"], ["/project/secrets/**"]);

// 权限沙箱 — 对象形式（字段均可选）
setPermissions({
  readPaths: ["/project/**"],
  denyPaths: ["/project/secrets/**"],
});
```

---

## 权限沙箱规则

1. `null` — 开放模式（允许一切访问）
2. denyPaths 匹配 → 始终阻止（拒绝优先于允许）
3. 非空 allow 列表 → 路径必须匹配至少一个 allow 模式
4. 空 allow 列表 → 允许所有（除被 deny 匹配的路径外）

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

`buildPrompt(recipePath, callRecord)` 按配方的 zone 配置拼装 prompt，各 zone 按 `position`（before/after）围绕 `{{CURRENT_TURN}}` 插入。

---

## 关键约束

- `core/` 模块零 PI 依赖、零 I/O — I/O 通过 `utils/` 委托
- JSONL 文件使用原子写入（.tmp + rename）确保崩溃安全
- 权限状态是模块级可变的 — 进程重启后重置
- `tsconfig` 启用 `exactOptionalPropertyTypes` 和 `verbatimModuleSyntax`

---

## 延伸阅读

- **用户手册（英文）**：`docs/user-manual.md` — 完整的项目使用指南
- **L1 文件文档**：`docs/L1-files/` — 按文件的源码级文档，含行号引用
