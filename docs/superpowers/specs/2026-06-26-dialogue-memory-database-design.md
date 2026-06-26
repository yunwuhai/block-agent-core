# 对话记忆数据库 — 设计方案

> **状态：** 已批准
> **日期：** 2026-06-26
> **定位：** PI Coding Agent 扩展，纯库（不管理目录结构、不做 AI 决策）

## 1. 动机

现有 efficiency-subagent 是一个"subagent 运行时"——它管理 run 生命周期、加载 profile、执行流水线、生成 handoff/transcript。但这个设计将"存储层"和"决策层"耦合在一起：AI 如何选择上下文、何时生成 handoff、怎样打 tag——这些决策被硬编码在运行时中。

本设计将项目重新定位为**对话记忆数据库**（Dialogue Memory Database）。它只做两件事：

1. 定义 8 种标准化文件格式
2. 提供纯函数式 CRUD API + 提示词拼装工具

所有决策（workflow 策略、handoff 生成、tag 标注、上下文选择）交给上层调用方。

## 2. 架构

```
┌──────────────────────────────────────────────┐
│         调用方（workflow 软件 / AI）           │
│                                              │
│  职责：                                       │
│  - 目录结构管理                                │
│  - AI 调用与策略                               │
│  - handoff 生成（外部 subagent）               │
│  - tag 生成（外部 subagent）                   │
│  - 选择加载哪些上下文                           │
│  - 管理 ID 序号                               │
├──────────────────────────────────────────────┤
│       本项目（对话记忆数据库）                   │
│                                              │
│  8 种文件 × 每种 4 个操作 + 拼装/发送/保存      │
│                                              │
│  append(path, record)    — 追加一条            │
│  get(path, id)           — 按 ID 读取          │
│  query(path, filter)     — 按条件查询          │
│  update(path, id, patch) — 更新一条            │
│                                              │
│  buildPrompt(recipe, callRecord, resolver)     │
│  sendPrompt(prompt, send)                     │
│  saveTurn(params)                              │
└──────────────────────────────────────────────┘
```

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
// 提示词拼装与发送
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

/**
 * 将提示词发送给 AI 并获取回复。
 *
 * @param prompt  — buildPrompt 的产物
 * @param send    — 调用方注入的发送函数
 * @returns AI 的回复文本
 */
sendPrompt(
  prompt: string,
  send: (prompt: string) => Promise<string>,
): Promise<string>

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
│  当前轮对话内容（调用方提供）    │
│  └─ 来自 TurnInput.userText  │
├──────────────────────────────┤
│  after zones（按 recipe 顺序） │
│  ├─ zone.attachments         │
│  └─ zone.emphasis            │
└──────────────────────────────┘
```

当前轮对话内容由调用方在 `buildPrompt` 返回后自行拼接（通常放在 before 和 after 之间）。

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

---

## 附录 A：旧模块废弃清单

| 旧模块 | 原因 |
|--------|------|
| `backend/runtime/run.ts` (RunLifecycle) | 被 CRUD API + buildPrompt 替代 |
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
| `index.ts` (PI 工具注册) | 重写为对话记忆数据库入口 |

**保留：** 仅 `backend/core/types.ts`（重定义新类型）。

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
