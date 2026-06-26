# 对话记忆数据库 — 设计方案

> **状态：** 已批准
> **日期：** 2026-06-26
> **定位：** PI 扩展——定义标准化文件格式，提供纯函数 CRUD + 提示词拼装，以 PI 工具形式暴露给 AI 调用

## 1. 动机

现有 efficiency-subagent 是一个"subagent 运行时"——它管理 run 生命周期、加载 profile、执行流水线、生成 handoff/transcript。但这个设计将"存储层"和"决策层"耦合在一起：AI 如何选择上下文、何时生成 handoff、怎样打 tag——这些决策被硬编码在运行时中。

本设计将项目重新定位为**对话记忆数据库**（Dialogue Memory Database）。它做三件事：

1. 定义 8 种标准化文件格式
2. 提供纯函数式 CRUD API + 提示词拼装工具（命名导出，无 PI 依赖）
3. 以 **PI 扩展**形式注册 `dialogue_memory` 工具，供 AI 在会话中直接调用（默认导出）

所有决策（workflow 策略、handoff 生成、tag 标注、上下文选择）交给上层调用方——无论是一个手动的 PI 会话，还是一个通过 PI SDK 构建的 workflow agent。

## 2. 架构

```
┌─────────────────────────────────────────────────────┐
│              上层调用方                               │
│                                                     │
│  方式 A：终端用户在 PI 中直接使用                       │
│    pi → AI 调用 dialogue_memory 工具                 │
│                                                     │
│  方式 B：workflow agent（PI SDK 构建）                │
│    createAgentSession({                              │
│      extensionFactories: [dialogueMemoryExtension]   │
│    })                                               │
│    → AI 调用 dialogue_memory 工具                    │
│    → 或直接 import { buildPrompt, saveTurn } 使用     │
│                                                     │
│  职责：                                              │
│  - 目录结构管理                                       │
│  - AI 调用与策略（通过 PI）                            │
│  - handoff 生成（外部 subagent）                      │
│  - tag 生成（外部 subagent）                          │
│  - 选择加载哪些上下文                                  │
│  - 管理 ID 序号                                      │
├─────────────────────────────────────────────────────┤
│           本项目（对话记忆数据库）                      │
│                                                     │
│  ┌─ 核心层（命名导出，零 PI 依赖）─┐                   │
│  │                                  │                │
│  │  8 种文件 × CRUD                 │                │
│  │  buildPrompt()                   │                │
│  │  saveTurn()                      │                │
│  │                                  │                │
│  ├──────────────────────────────────┤                │
│  │  PI 扩展层（默认导出）             │                │
│  │                                  │                │
│  │  export default function(pi) {   │                │
│  │    pi.registerTool({             │                │
│  │      name: "dialogue_memory",    │                │
│  │      ...                         │                │
│  │    });                           │                │
│  │  }                               │                │
│  └──────────────────────────────────┘                │
└─────────────────────────────────────────────────────┘
```

**双导出设计：**

| 导出方式 | 内容 | 用途 |
|----------|------|------|
| `export default function(pi)` | PI 扩展工厂，注册 `dialogue_memory` 工具 | PI 会话中 AI 直接调用 |
| `export { buildPrompt, saveTurn, appendTurn, ... }` | 纯函数，无 PI 依赖 | Workflow agent 程序化调用 |

与旧系统的关系：**完全重写。** 旧模块全部废弃，见附录 A。

## 3. 8 种文件定义

### 3.1 单轮对话信息（`.md`）

**用途：** 存储单轮对话的完整正文。

**格式：**
```markdown
## User

帮我写一个从数据库读取用户信息的函数

## Assistant

好的，我先看一下现有的数据库配置文件。

## Assistant (tool: read)

**Path:** /home/project/src/db.ts
**Result:**
```typescript
import { createPool } from "pg";
export const pool = createPool({...});
```

## Assistant

看到了，现在基于这个配置来写函数。这里用到了 {{tool-result:call-001}} 的查询结果。
```

**规则：**
- 以 `## User` 开头
- AI 回复用 `## Assistant`，纯文本
- 工具调用用 `## Assistant (tool: <name>)`，包含 `**Params:**` 和 `**Result:**` 块
- 工具结果可通过 `{{tool-result:<call-id>}}` 占位符引用，避免内嵌大段输出

### 3.2 单轮对话记录表（`.jsonl`）

**用途：** 对话轮次的索引/目录。

**格式：** 每行一条 JSON：
```jsonl
{"id":"turn-001","path":"turns/turn-001.md","handoff":"用户请求写数据库查询函数，AI 读取了 db.ts 后实现","tags":["coding","database","read"]}
```

**字段：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | `turn-NNN` 格式，唯一标识 |
| `path` | string | 是 | 指向单轮对话信息 `.md` 文件 |
| `handoff` | string | 否 | 内容摘要，外部 subagent 生成，初始可为空 |
| `tags` | string[] | 否 | 标签，外部 subagent 生成 |

**说明：** 不考虑多 Agent / 多 Session 场景，不设 `sessionId`。不考虑交叉对话的轮次排序，不设 `round`。

### 3.3 工具调用信息（`.jsonl`）

**用途：** 工具调用的完整日志，基于 PI 的 `ToolResponse` 格式。

**格式：** 每行一条 JSON：
```jsonl
{"id":"call-001","turnId":"turn-001","toolName":"read","params":{"path":"/home/project/src/db.ts"},"content":[{"type":"text","text":"import { createPool } from..."}],"details":{},"truncated":false,"error":false,"durationMs":120}
```

**字段：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | `call-NNN` 格式 |
| `turnId` | string | 是 | 所属单轮对话 ID |
| `toolName` | string | 是 | 工具名（read/bash/write/edit 等） |
| `params` | object | 是 | 调用参数 |
| `content` | ContentBlock[] | 是 | PI 标准 `ToolResponse.content`：`{type: "text"\|"image", text?, data?, mimeType?}` |
| `details` | object | 否 | PI 标准 `ToolResponse.details`，不发给 LLM 但持久化 |
| `truncated` | boolean | 否 | 结果是否被截断，默认 false |
| `error` | boolean | 否 | 是否为错误结果，默认 false |
| `durationMs` | number | 否 | 执行耗时（毫秒） |

### 3.4 模板提示词（`.md`）

**用途：** 可复用的纯提示词模板。

**格式：** 普通 Markdown 文本，无 YAML 头、无占位符：
```markdown
你是一个代码审查助手。请关注以下方面：
- 代码风格是否符合项目规范
- 是否存在潜在的 bug 或边界情况
- 是否有性能优化空间

请以结构化方式输出审查结果，每条建议标注严重程度。
```

### 3.5 模板提示词记录表（`.jsonl`）

**用途：** 模板索引，并为每个模板绑定权限。

**格式：** 每行一条 JSON：
```jsonl
{"id":"tmpl-001","path":"templates/code-review.md","tags":["review","code"],"allowReadPaths":["/home/project/*"],"allowWritePaths":["/home/project/src/*"],"denyPaths":["/home/project/.env"],"allowBash":false}
```

**字段：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | `tmpl-NNN` 格式 |
| `path` | string | 是 | 指向模板 `.md` 文件 |
| `tags` | string[] | 否 | 标签 |
| `allowReadPaths` | string[] | 否 | 允许**读取**的路径（glob），空 = 无读取权限 |
| `allowWritePaths` | string[] | 否 | 允许**写入**的路径（glob），空 = 无写入权限 |
| `denyPaths` | string[] | 否 | 显式禁止的路径（glob），**优先级高于 allow** |
| `allowBash` | boolean | 否 | 是否允许使用 bash，默认 false |

**权限合并规则：** 加载多个模板时，`allowReadPaths`、`allowWritePaths`、`denyPaths` 各自取**并集**。合并后展示 diff（合并前权限 vs 合并后新增权限），要求用户二次确认。确认后生效。

### 3.6 引用文件记录表（`.jsonl`）

**用途：** 记录工具读写的文件引用。

**格式：** 每行一条 JSON：
```jsonl
{"id":"ref-001","filePath":"/home/project/src/db.ts","turnId":"turn-001","toolCallId":"call-001","accessType":"read","handoff":"数据库连接池配置文件，使用 pg 库创建 PostgreSQL 连接"}
```

**字段：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | `ref-NNN` 格式 |
| `filePath` | string | 是 | 被访问的文件绝对路径 |
| `turnId` | string | 是 | 所属对话轮次 ID |
| `toolCallId` | string | 是 | 关联的工具调用 ID |
| `accessType` | "read" \| "write" | 是 | 访问类型 |
| `handoff` | string | 否 | 文件内容简述 |

**说明：** 不记录时间戳——文件的修改时间可通过文件系统获取，无需冗余存储。

### 3.7 单轮调用记录表（`.jsonl`）

**用途：** 本轮提示词的"组装配方执行记录"——引用了哪个方案、每个分区实际加载了哪些条目。

**格式：** 每行一条 JSON：
```jsonl
{"id":"rec-001","turnId":"turn-001","recipeId":"default-context","zones":{"config":[{"file":"/path/to/templates.jsonl","id":"tmpl-001"}],"presets":[{"file":"/path/to/templates.jsonl","id":"tmpl-001"}],"history":[{"file":"/path/to/turns.jsonl","id":"turn-000","mode":"handoff"}],"attachments":[{"file":"/path/to/refs.jsonl","id":"ref-001","lines":"1-80"}],"emphasis":[]}}
```

**字段：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | `rec-NNN` 格式 |
| `turnId` | string | 是 | 对应的单轮对话 ID |
| `recipeId` | string | 是 | 使用的组装方案 ID |
| `zones` | object | 是 | 每个分区的 `Ref[]` |

**Ref 结构：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | string | 是 | 记录表文件路径（用于消歧 ID 重复） |
| `id` | string | 是 | 记录 ID |
| `mode`? | "full" \| "handoff" | 否 | 加载模式，默认 full |
| `lines`? | string | 否 | 按行范围加载，如 "1-80" |

### 3.8 组装方案（`.toml`）

**用途：** 提示词组装的"菜谱"——定义分几个区、每区的顺序和分隔符。所有方案注册在同一个 TOML 文件中。

**格式：**
```toml
[[recipes]]
id = "default-context"
name = "默认上下文方案"
description = "标准对话上下文组装方案"

[[recipes.zones]]
name = "config"
description = "工具表和权限配置信息，由模板权限自动生成"
position = "before"
separator = ""

[[recipes.zones]]
name = "presets"
description = "预设提示词，按模板记录表中的顺序拼接"
position = "before"
separator = "---presets---"

[[recipes.zones]]
name = "history"
description = "历史对话轮次，按需选择 full 或 handoff 模式加载"
position = "before"
separator_before = "---context start---"
separator_after = "---context end---"

[[recipes.zones]]
name = "attachments"
description = "引用文件内容，支持按行加载"
position = "after"
separator = "---attachment---"

[[recipes.zones]]
name = "emphasis"
description = "强调信息，放在提示词末尾"
position = "after"
separator = ""
```

**字段：**

| 级别 | 字段 | 类型 | 说明 |
|------|------|------|------|
| recipe | `id` | string | 唯一标识，调用时通过 recipeId 引用 |
| recipe | `name` | string | 人类可读名称 |
| recipe | `description` | string | 方案简介 |
| zone | `name` | string | 分区名 |
| zone | `description` | string | 分区简介 |
| zone | `position` | "before" \| "after" | 在当前轮对话之前还是之后 |
| zone | `separator` | string | 条目间分隔符（等同于同时设 before/after 为相同值） |
| zone | `separator_before` | string | 整个分区的前缀分隔文本 |
| zone | `separator_after` | string | 整个分区的后缀分隔文本 |

**选择 TOML 的理由：** 比 JSON 可读性好，支持注释，嵌套数组语法清晰。

---

## 4. ID 体系

| 前缀 | 格式 | 示例 | 用于 |
|------|------|------|------|
| `turn-` | `turn-NNN` | `turn-001` | 单轮对话记录 |
| `call-` | `call-NNN` | `call-001` | 工具调用 |
| `tmpl-` | `tmpl-NNN` | `tmpl-001` | 模板提示词 |
| `ref-` | `ref-NNN` | `ref-001` | 文件引用 |
| `rec-` | `rec-NNN` | `rec-001` | 调用记录 |

序号由调用方管理，本项目只接受和存储 ID 字符串。

---

## 5. API 表面

### 5.1 核心层（命名导出，零 PI 依赖）

```typescript
// ===========================================================================
// 通用 CRUD — 每种文件提供相同模式的操作
// ===========================================================================

// --- Turns（单轮对话）---
appendTurn(tablePath: string, turnMdPath: string, turn: TurnInput): TurnRecord
getTurn(tablePath: string, id: string): TurnRecord | null
queryTurns(tablePath: string, filter: TurnFilter): TurnRecord[]
updateTurn(tablePath: string, id: string, patch: Partial<TurnRecord>): void

// --- ToolCalls（工具调用）---
appendToolCall(tablePath: string, call: ToolCallInput): ToolCallRecord
getToolCall(tablePath: string, id: string): ToolCallRecord | null
queryToolCalls(tablePath: string, filter: ToolCallFilter): ToolCallRecord[]
updateToolCall(tablePath: string, id: string, patch: Partial<ToolCallRecord>): void

// --- Templates（模板提示词）---
appendTemplate(tablePath: string, templateMdPath: string, tmpl: TemplateInput): TemplateRecord
getTemplate(tablePath: string, id: string): TemplateRecord | null
queryTemplates(tablePath: string, filter: TemplateFilter): TemplateRecord[]
updateTemplate(tablePath: string, id: string, patch: Partial<TemplateRecord>): void

// --- FileRefs（文件引用）---
appendFileRef(tablePath: string, ref: FileRefInput): FileRefRecord
getFileRef(tablePath: string, id: string): FileRefRecord | null
queryFileRefs(tablePath: string, filter: FileRefFilter): FileRefRecord[]
updateFileRef(tablePath: string, id: string, patch: Partial<FileRefRecord>): void

// --- CallRecords（调用记录）---
appendCallRecord(tablePath: string, rec: CallRecordInput): CallRecord
getCallRecord(tablePath: string, id: string): CallRecord | null
queryCallRecords(tablePath: string, filter: CallRecordFilter): CallRecord[]
updateCallRecord(tablePath: string, id: string, patch: Partial<CallRecord>): void

// --- Recipes（组装方案）---
loadRecipes(recipePath: string): Recipe[]
getRecipe(recipePath: string, id: string): Recipe | null
addRecipe(recipePath: string, recipe: Recipe): void
updateRecipe(recipePath: string, id: string, patch: Partial<Recipe>): void

// ===========================================================================
// 提示词拼装
// ===========================================================================

/**
 * 根据组装方案和调用记录拼出最终提示词。
 *
 * 算法：
 *   1. 从 recipePath 加载组装方案，按 recipeId 找到对应 recipe
 *   2. 按 position 分组：before zones 和 after zones
 *   3. 遍历每个 zone，取 callRecord.zones[zoneName] 中的 refs
 *   4. 对每个 ref 调用 resolver(ref) 获取内容文本
 *   5. 按 zone 的分隔符规则拼接
 *   6. 返回完整提示词字符串
 *
 * @param recipePath  — 组装方案 .toml 文件路径
 * @param callRecord  — 单轮调用记录
 * @param resolver    — 调用方注入的加载函数：(ref) => 该引用的文本内容
 * @returns 拼接后的完整提示词
 */
buildPrompt(
  recipePath: string,
  callRecord: CallRecord,
  resolver: (ref: Ref) => string,
): string

// ===========================================================================
// 保存 — 整轮对话的一次性保存
// ===========================================================================

/**
 * 保存一整轮对话：对话信息 .md + 各记录表追加。
 *
 * 原子性：先写 .md 文件，再依次追加各 .jsonl 表。
 * 任一步失败时已写入的数据不回滚（调用方负责重试/清理）。
 */
saveTurn(params: {
  turnsPath: string          // 单轮对话记录表 .jsonl 路径
  turnMdPath: string         // 单轮对话信息 .md 文件路径
  toolsPath: string           // 工具调用信息 .jsonl 路径
  refsPath: string            // 引用文件记录表 .jsonl 路径
  callRecordsPath: string     // 单轮调用记录表 .jsonl 路径
  turn: TurnInput             // 对话内容
  toolCalls: ToolCallInput[]  // 工具调用列表
  fileRefs: FileRefInput[]    // 文件引用列表
  callRecord: CallRecordInput // 调用记录
}): SavedTurn
```

### 5.2 PI 扩展层（默认导出）

```typescript
/**
 * PI 扩展入口。注册 dialogue_memory 工具到当前 PI 会话。
 *
 * 安装方式：
 *   1. 放入 .pi/extensions/ 目录（PI 自动发现）
 *   2. pi -e ./index.ts（快速测试）
 *   3. PI SDK: extensionFactories: [dialogueMemoryExtension]
 */
export default function (pi: ExtensionAPI): void {
  pi.registerTool({
    name: "dialogue_memory",
    label: "Dialogue Memory",
    description: `对话记忆数据库——管理跨会话的对话历史、模板提示词、组装方案。
支持 8 种文件格式的 CRUD，以及在对话中加载上下文、保存轮次。`,
    parameters: Type.Object({
      action: StringEnum([
        "load",    // 加载上下文（buildPrompt）
        "save",    // 保存当前轮次（saveTurn）
        "query",   // 查询记录
        "manage",  // 管理记录（CRUD）
      ] as const),
      // --- load 参数 ---
      recipePath: Type.Optional(Type.String()),
      recipeId: Type.Optional(Type.String()),
      callRecordPath: Type.Optional(Type.String()),
      // --- save 参数 ---
      turnsPath: Type.Optional(Type.String()),
      turnMdPath: Type.Optional(Type.String()),
      toolsPath: Type.Optional(Type.String()),
      refsPath: Type.Optional(Type.String()),
      callRecordsPath: Type.Optional(Type.String()),
      turn: Type.Optional(Type.Object({...})),       // TurnInput
      toolCalls: Type.Optional(Type.Array(Type.Object({...}))),
      fileRefs: Type.Optional(Type.Array(Type.Object({...}))),
      callRecord: Type.Optional(Type.Object({...})),  // CallRecordInput
      // --- query/manage 参数 ---
      table: Type.Optional(StringEnum([
        "turns", "toolCalls", "templates",
        "fileRefs", "callRecords", "recipes",
      ] as const)),
      tablePath: Type.Optional(Type.String()),
      filter: Type.Optional(Type.Object({})),
      op: Type.Optional(StringEnum([
        "get", "append", "update", "delete",
      ] as const)),
      id: Type.Optional(Type.String()),
      data: Type.Optional(Type.Object({})),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      switch (params.action) {
        case "load":
          return handleLoad(params, ctx);
        case "save":
          return handleSave(params, ctx);
        case "query":
          return handleQuery(params, ctx);
        case "manage":
          return handleManage(params, ctx);
      }
    },
  });
}
```

**设计说明：**

- **`sendPrompt` 被移除。** AI 调用由 PI 本身管理——当 AI 调用 `dialogue_memory` 工具时，返回的内容直接进入 PI 会话上下文。不需要库来"发送提示词"。
- 如需程序化 AI 调用（workflow agent 场景），调用方直接使用 PI SDK 的 `createAgentSession()` + `session.prompt()`，库只负责拼装提示词和保存结果。
- 工具参数中所有文件路径均为可选——AI 可在调用时动态指定，也可通过模板记录表中的预设路径。

### 过滤器类型

```typescript
interface TurnFilter {
  tags?: string[]      // 匹配任一标签
  ids?: string[]       // 指定 ID 列表
}

interface ToolCallFilter {
  turnId?: string      // 属于哪轮对话
  toolName?: string    // 工具名
  ids?: string[]       // 指定 ID 列表
}

interface TemplateFilter {
  tags?: string[]
  ids?: string[]
}

interface FileRefFilter {
  turnId?: string
  filePath?: string    // glob 匹配
  accessType?: "read" | "write"
  ids?: string[]
}

interface CallRecordFilter {
  turnId?: string
  recipeId?: string
  ids?: string[]
}
```

---

## 6. buildPrompt 执行细节

`buildPrompt` 产出的提示词结构：

```
┌──────────────────────────────┐
│  before zones（按 recipe 顺序）│
│  ├─ zone.config              │
│  ├─ zone.presets             │
│  └─ zone.history             │
├──────────────────────────────┤
│  当前轮对话内容                 │
│  └─ PI 扩展模式：占位标记       │
│     （AI 在实际对话中填充）      │
│  └─ 程序化模式：调用方拼接       │
│     TurnInput.userText        │
├──────────────────────────────┤
│  after zones（按 recipe 顺序） │
│  ├─ zone.attachments         │
│  └─ zone.emphasis            │
└──────────────────────────────┘
```

在 PI 扩展模式下，`buildPrompt` 返回的文本直接进入 AI 上下文——AI 看到的是"before zones + 当前对话 + after zones"的完整视图。当前轮对话由 PI 会话管理，无需库来发送。

## 7. 关键设计决策

| 决策 | 理由 |
|------|------|
| 所有路径参数化，不自动推导 | 库不应管理目录结构 |
| ID 格式为 `<type>-NNN` | 前缀区分类型，防止跨表 ID 碰撞 |
| 权限分 read/write/deny 三类 | 读和写是不同风险级别，需独立控制 |
| 不控制 bash 路径 | bash 控制交给专用工具 |
| denyPaths 优先于 allow | 安全基线——先封后开 |
| 权限合并需二次确认 | 防止恶意/误操作模板合并扩大权限 |
| TOML 而非 JSON 存组装方案 | 可读性、注释支持、嵌套数组自然 |
| buildPrompt 用注入的 resolver | 库不依赖文件系统，调用方控制 IO |
| PI 扩展而非独立 Agent | 作为工具被 AI 调用，不拥有自己的 AI 会话；AI 调用由 PI 管理 |
| 双导出（命名 + 默认） | 核心层供 workflow agent 程序化调用；扩展层供 PI 会话中 AI 调用 |

## 8. PI 工具行为设计

### 8.1 工具定位

`dialogue_memory` 是一个 PI 工具，注册到 PI 会话中供 AI 调用。它不创建自己的 AI 会话——AI 对话完全由 PI 管理。工具的职责是：

1. **读写对话记忆文件**（8 种格式）
2. **组装上下文提示词**（buildPrompt）
3. **保存对话轮次**（saveTurn）

### 8.2 四个 Action

#### `load` — 加载上下文

AI 在开始新一轮对话前调用，获取拼装好的上下文提示词。

```
输入：recipePath, recipeId, callRecordPath
内部流程：
  1. 从 recipePath 加载组装方案 → 找到 recipe
  2. 从 callRecordPath 加载调用记录 → 获取各 zone 的 refs
  3. 对每个 ref，resolver 读取对应文件内容
  4. 按 zone 规则拼接
  5. 附加当前轮用户输入的占位标记
输出：拼装好的完整提示词文本 → 进入 PI 会话上下文
```

#### `save` — 保存轮次

AI 在一轮对话结束后调用，持久化所有信息。

```
输入：turnsPath, turnMdPath, toolsPath, refsPath, callRecordsPath,
      turn, toolCalls, fileRefs, callRecord
内部流程：
  1. 将 turn 写入 .md 文件
  2. 追加 TurnRecord 到 turnsPath
  3. 追加各 ToolCall 到 toolsPath
  4. 追加各 FileRef 到 refsPath
  5. 追加 CallRecord 到 callRecordsPath
输出：SavedTurn（含所有写入的文件路径和记录 ID）
```

#### `query` — 查询记录

AI 需要查找历史信息时调用。

```
输入：table, tablePath, filter
内部流程：
  1. 读取对应 .jsonl 表
  2. 按 filter 过滤（tags, turnId, toolName, accessType 等）
  3. 返回匹配记录列表
输出：匹配的记录数组
```

#### `manage` — 管理记录

AI 需要增删改记录时调用（模板管理、方案维护等）。

```
输入：table, tablePath, op, id, data
内部流程：
  op=get:    按 id 读取单条记录
  op=append: 追加新记录（自动分配 id）
  op=update: 更新已有记录的部分字段
  op=delete: 删除记录（标记删除或物理删除，视实现而定）
输出：操作结果
```

### 8.3 Resolver 策略

`load` action 中的 resolver（将 Ref 解析为文本内容）有以下来源优先级：

1. **对话记录**（`mode: "handoff"`）：读取 TurnRecord 的 `handoff` 摘要字段
2. **对话记录**（`mode: "full"`，默认）：读取 TurnRecord 对应的完整 `.md` 文件
3. **模板提示词**：读取 TemplateRecord 对应的 `.md` 文件内容
4. **引用文件**（`lines` 指定）：按行范围读取 FileRefRecord 对应的实际文件
5. **引用文件**（无 `lines`）：读取 FileRefRecord 对应文件的全部内容

### 8.4 权限确认

当 AI 调用 `manage` 或 `save` 涉及**写入**操作时，工具通过 `ctx.ui.confirm()` 向用户展示即将修改的文件路径并要求确认。

当 AI 调用 `load` 并加载了多个模板时，如果合并后的权限集合（allowReadPaths/allowWritePaths/denyPaths）有新增项，工具向用户展示权限 diff 并要求二次确认。

### 8.5 与 PI 会话的关系

```
PI 会话
  │
  ├─ 用户: "帮我写一个数据库查询函数"
  │
  ├─ AI 调用 dialogue_memory (action: "load")
  │   └─ 工具返回拼装好的上下文（含历史对话摘要、相关模板、引用文件）
  │
  ├─ AI 基于上下文回答（调用 read/write/bash 等工具）
  │
  ├─ AI 调用 dialogue_memory (action: "save")
  │   └─ 工具保存本轮对话、工具调用记录、文件引用、调用记录
  │
  └─ 用户: "继续完善这个函数"
      ├─ AI 调用 dialogue_memory (action: "load")
      │   └─ 加载上一轮 handoff + 模板权限
      └─ ...（循环）
```

---

## 附录 A：旧模块废弃清单

| 旧模块 | 原因 |
|--------|------|
| `backend/runtime/run.ts` (RunLifecycle) | 被 CRUD API + dialogue_memory 工具的 load/save action 替代 |
| `backend/storage/event-log.ts` (events.jsonl) | 被 #3 工具调用信息替代 |
| `backend/storage/run-artifacts.ts` (handoff/transcript) | 被 #1 #2 单轮对话替代 |
| `backend/runtime/registry-store.ts` (registry.jsonl) | 被 #2 #5 #6 记录表替代 |
| `backend/core/pipeline.ts` (流水线) | 被 #7 #8 buildPrompt 替代 |
| `backend/core/capability.ts` (CapabilityRegistry) | 能力系统废弃，被模板标签替代 |
| `backend/computation/policy/` (策略引擎) | 被 #5 模板权限替代 |
| `backend/input/` (profile 加载) | 被模板提示词操作替代 |
| `backend/runtime/prompt-state.ts` (占位符引擎) | 被 `{{tool-result:id}}` 占位符 + buildPrompt 替代 |
| `backend/core/composer.ts` (三段式组装) | 被 buildPrompt 替代 |
| `backend/runtime/actions.ts` (MountController) | schedule/unschedule 概念废弃 |
| `backend/runtime/output.ts` (handoff/transcript 格式化) | 被 saveTurn 替代 |
| `backend/output/` | 同上 |
| `index.ts` (PI 工具注册) | 重写：默认导出 PI 扩展（注册 `dialogue_memory` 工具），命名导出核心 CRUD + buildPrompt + saveTurn |

**保留：** 仅 `backend/core/types.ts`（重定义新类型）。

### 新模块结构

```
efficiency-subagent/
├── index.ts                    # 默认导出 PI 扩展 + 命名导出核心 API
├── core/
│   ├── types.ts                # 全部类型定义（从旧 types.ts 重写）
│   ├── turns.ts                # Turn CRUD（appendTurn, getTurn, queryTurns, updateTurn）
│   ├── tool-calls.ts           # ToolCall CRUD
│   ├── templates.ts            # Template CRUD
│   ├── file-refs.ts            # FileRef CRUD
│   ├── call-records.ts         # CallRecord CRUD
│   ├── recipes.ts              # Recipe CRUD（TOML 读写）
│   ├── build-prompt.ts         # buildPrompt（提示词拼装引擎）
│   └── save-turn.ts            # saveTurn（整轮保存编排）
├── tool/
│   ├── dialogue-memory.ts      # PI 工具定义（parameters + execute）
│   └── actions/
│       ├── load.ts             # load action 实现
│       ├── save.ts             # save action 实现
│       ├── query.ts            # query action 实现
│       └── manage.ts           # manage action 实现
└── utils/
    ├── jsonl.ts                # JSONL 原子读写工具
    ├── toml.ts                 # TOML 解析/序列化
    └── glob.ts                 # Glob 匹配（权限路径）
```

## 附录 B：输入类型 vs 记录类型

输入类型（调用方传入，不含 id/path）和记录类型（完整持久化形态）的区别：

```typescript
// TurnInput — 调用 appendTurn 时传入
interface TurnInput {
  userText: string;           // ## User 后的内容
  assistantBlocks: AssistantBlock[];
}
type AssistantBlock =
  | { type: "text"; text: string }
  | { type: "tool"; toolName: string; params: Record<string, unknown>;
      content: ContentBlock[]; details?: Record<string, unknown>;
      truncated?: boolean; error?: boolean; durationMs?: number; }

// ToolCallInput — 调用 appendToolCall 时传入
interface ToolCallInput {
  turnId: string; toolName: string; params: Record<string, unknown>;
  content: ContentBlock[]; details?: Record<string, unknown>;
  truncated?: boolean; error?: boolean; durationMs?: number;
}

// TemplateInput
interface TemplateInput {
  path: string; tags?: string[];
  allowReadPaths?: string[]; allowWritePaths?: string[];
  denyPaths?: string[]; allowBash?: boolean;
}

// FileRefInput
interface FileRefInput {
  filePath: string; turnId: string;
  toolCallId: string; accessType: "read" | "write"; handoff?: string;
}

// CallRecordInput
interface CallRecordInput {
  turnId: string; recipeId: string;
  zones: Record<string, Ref[]>;
}
```

## 附录 C：类型总览

```typescript
// --- 核心记录类型 ---

interface TurnRecord {
  id: string; path: string; handoff: string; tags: string[];
}

interface ToolCallRecord {
  id: string; turnId: string; toolName: string; params: Record<string, unknown>;
  content: ContentBlock[]; details: Record<string, unknown>;
  truncated: boolean; error: boolean; durationMs: number;
}

interface ContentBlock {
  type: "text" | "image"; text?: string; data?: string; mimeType?: string;
}

interface TemplateRecord {
  id: string; path: string; tags: string[];
  allowReadPaths: string[]; allowWritePaths: string[];
  denyPaths: string[]; allowBash: boolean;
}

interface FileRefRecord {
  id: string; filePath: string; turnId: string;
  toolCallId: string; accessType: "read" | "write"; handoff: string;
}

interface CallRecord {
  id: string; turnId: string; recipeId: string;
  zones: Record<string, Ref[]>;
}

interface Ref {
  file: string; id: string; mode?: "full" | "handoff"; lines?: string;
}

interface Recipe {
  id: string; name: string; description: string; zones: Zone[];
}

interface Zone {
  name: string; description: string; position: "before" | "after";
  separator?: string; separator_before?: string; separator_after?: string;
}

// --- 保存结果 ---

interface SavedTurn {
  turnMdPath: string;        // 对话 .md 写入路径
  turnRecord: TurnRecord;    // 追加的记录
  toolCallRecords: ToolCallRecord[];
  fileRefRecords: FileRefRecord[];
  callRecord: CallRecord;
}
```
