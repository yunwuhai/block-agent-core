# Efficiency Subagent — LLM 代理用户手册

本手册介绍如何使用和理解 efficiency-subagent 项目。目标读者是需要调用、修改或扩展此插件的 LLM 代理，而非人类最终用户。在阅读源码之前请先阅读本文；它提供架构导向并覆盖所有公开接口。

---

## 项目是什么

efficiency-subagent 是 PI Coding Agent 的一个基于 profile 的子代理插件。它可以让你调用受控的子代理，并提供策略权限、动态 prompt registry 控制和持久 session。每次运行都会产出结构化的 handoff 文档，使后续调用可以从中断处继续。插件完全运行在宿主代理的扩展系统内部，不自行管理 LLM 调用或沙箱进程。

---

## 架构总览

系统共 16 个功能模块，分为两层（前端和后端），其中后端又划分为四个象限：

```
┌──────────────────────────────────────────────────────────────┐
│  前端（面向用户）                                               │
│  ┌─────────────────────┐  ┌────────────────────────────────┐ │
│  │ Display（显示）       │  │ Operation（操作）               │ │
│  │ display-tui          │  │ root-entry（工具注册）           │ │
│  │ （ANSI 事件渲染）     │  │ runtime-core（动作循环）         │ │
│  └─────────────────────┘  └────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────┤
│  后端（数据处理）                                               │
│  ┌──────────────┐ ┌──────────────┐ ┌────────┐ ┌────────────┐│
│  │ Input（输入）  │ │ Output（输出） │ │Storage │ │Computation ││
│  │ configuration │ │ run-artifact │ │（存储） │ │ （计算）     ││
│  │ profile-mgmt  │ │ -generation  │ │durable-│ │policy-engine││
│  │ project-policy│ │              │ │run-str │ │registry pipe││
│  │               │ │              │ │registry│ │prompt-engine││
│  │               │ │              │ │-storage│ │             ││
│  └──────────────┘ └──────────────┘ └────────┘ └────────────┘│
└──────────────────────────────────────────────────────────────┘
```

**前端 Display** 将结构化事件格式化为 ANSI 样式的终端输出，不含任何业务逻辑。

**前端 Operation** 负责工具注册（root-entry）和 17 阶段的执行生命周期（runtime-core）。runtime-core 编排器是中心枢纽，但它跨入了后端象限，这是一个已知的架构问题。

**后端 Input** 加载并校验配置。三个模块：configuration（Zod schema）、profile-management（`.profiles/*.md` 的 YAML 前置元数据解析器）和 project-policy（`.pi/efficiency-subagent/config.json` 的 JSON 加载器）。

**后端 Output** 生成结构化产物。一个主模块：run-artifact-generation（handoff.md 和 transcript.md 构建器）。

**后端 Storage** 管理所有持久化。两个模块：durable-run-storage（运行目录、JSONL 事件/工具日志）和 registry-storage（JSONL 支持的 prompt 注册表，含四个 O(1) 内存索引）。

**后端 Computation** 包含策略引擎、完整的 prompt 注册表管线（类型、引擎、组装器）以及 prompt-engine（slot/placeholder 管理）。

### 执行流程

主执行路径自上而下运行：

```
用户调用工具 → root-entry 校验参数 → 加载 profile/项目配置
→ 合并策略 → 构建 prompt（registry + slots + placeholders）
→ 动作循环（每个动作：策略检查 → 模拟工具）
→ 构建 transcript → 写入 handoff → 持久化存储 → TUI 渲染
```

---

## 调用方式

插件注册一个工具：`efficiency_subagent`。

### efficiency_subagent 调用

使用以下参数调用：

| 参数 | 必填 | 类型 | 说明 |
|------|------|------|------|
| `profile` | 是 | string | `.profiles/*.md` 中定义的 profile 名称 |
| `task` | 是 | string | 子代理要执行的任务 |
| `runId` | 否 | string | 通过 ID 恢复之前的运行 |
| `actions` | 否 | array | 预定义操作列表（跳过 LLM 规划） |

当你用 `profile` 和 `task` 调用时，系统会加载指定 profile 的 YAML 前置元数据来确定：可用工具有哪些、注册哪些 placeholder 值、激活哪些 registry 条目、使用哪个 system prompt 模板。`task` 字符串会成为发送给子代理的用户消息。

如果省略 `runId`，系统会在 `.pi/subagents/runs/{profile}-{task}-{timestamp}-{hexSuffix}/` 下创建新的运行目录。如果提供了 `runId`，系统会恢复该运行：从已有运行目录中恢复 session 元数据、slot 状态和 registry 频率计数器。

## 关键模块及其使用场景

### Configuration（`config/`）
**功能：** 定义所有 Zod schema（ToolParams、ProfileFrontmatter、RegistryEntry、ProjectPolicy），在系统边界校验输入参数。
**何时交互：** 如果需要添加新的工具参数，在此处添加 Zod schema 并在 index.ts 中接入校验。如果调试"参数被拒绝"错误，首先检查 `ToolParamsSchema`。

### Profile Management（`config/profile-loader.ts`）
**功能：** 查找、加载并解析 `.profiles/*.md` 文件。使用自定义递归下降 YAML 解析器处理前置元数据块。返回类型化的 `ProfileDefinition` 对象。
**何时交互：** 创建或调试 profile 定义时。关键函数：`loadProfile(name)`。

### Project Policy（`config/project-loader.ts`）
**功能：** 加载 `.pi/efficiency-subagent/config.json` 作为项目级安全规则。文件缺失或无效时返回 `null`（放行所有）。
**何时交互：** 需要在项目级配置子代理的权限时（工具白名单、路径限制、网络规则）。

### Durable Run Storage（`storage/event-log.ts`）
**功能：** 创建运行目录、写入 JSONL 事件/工具/session 日志、回读事件、跨运行搜索、执行保留清理。
**何时交互：** 需要读取之前运行的事件进行分析，或构建监控工具时。关键导出：`createRunDir()`、`readEvents()`、`appendEvent()`、`searchRuns()`。

### Run Artifact Generation（`storage/handoff-store.ts`、`storage/transcript-projector.ts`）
**功能：** 产出 `handoff.md`（机器可消费的续跑上下文）和 `transcript.md`（人类可读的事件日志）。
**何时交互：** 跨调用消费 handoff 文档，或需要修改 handoff 格式时。关键导出：`writeHandoff()`、`buildTranscript()`、`buildJsonTranscript()`。

### Prompt Engine（`runtime/prompt-slots/engine.ts`）
**功能：** 通过三种机制管理动态 prompt 内容：基于 registry 的组合（主要）、`{{name}}` 占位符替换（遗留）和按优先级插入命名 slot（遗留）。维护模块级可变状态，支持序列化。
**何时交互：** 需要理解 prompt 组装机制或续跑状态时。关键导出：`setSlot()`、`pushSlot()`、`popSlot()`、`setOnceSlot()`、`registerPlaceholder()`、`renderPromptWithRegistry()`、`serializeSlots()`、`deserializeSlots()`。

### Policy Engine（`policy/`）
**功能：** 将多个 `PolicyEntry` 源合并为单一 `MergedPolicy`，然后在 7 个维度上评估工具调用：工具名、文件路径（支持 glob）、bash 命令、网络域名/端口、环境变量、嵌套子代理调用和 bash 重定向目标。
**何时交互：** 为 profile 配置沙箱限制，或调试"被策略阻止"错误时。关键导出：`mergePolicies()`、`evaluate()`。

### Runtime Core（`runtime/runner.ts`）
**功能：** 中心编排器。执行运行：加载 profile、合并策略、渲染 prompt、运行带重试逻辑的动作循环、构建 transcript 和 handoff、持久化状态。同时处理 run ID 解析和续跑一致性检查。
**何时交互：** 追踪执行生命周期、添加新的生命周期阶段，或调试运行失败原因时。关键导出：`executeRun(ctx)`。

### Root Entry（`index.ts`）
**功能：** 扩展入口点。在宿主的 `ExtensionAPI` 上注册 `efficiency_subagent` 工具，校验参数，重置 slots，调度到 `executeRun()`，并通过 `renderSectioned()` 渲染 TUI 结果。
**何时交互：** 修改工具接口或添加新的扩展级行为时。

### Display TUI（`display/`）
**功能：** 将生命周期事件格式化为 ANSI 样式的终端输出。定义 `DisplayEvent` 及其 10 个工厂函数和两种渲染器：compact（单行带状态图标）和 sectioned（按阶段分组的多行输出）。
**何时交互：** 添加新事件类型或修改终端输出外观时。

---

## Prompt Registry 系统

Prompt Registry 是一个三层系统，管理可复用的 prompt 片段库（文档、编码规范、工具说明），并按需注入到代理的上下文中。

### 三层架构

**第一层：registry-storage** — 持久化 JSONL 存储，带四个 O(1) 内存索引（按 ID、名称、标签、分组）。每条条目包含 content、filePath、priority、生命周期调度和频率限制字段。追踪每条条目的滑动窗口调用频率。

**第二层：registry-engine** — 包含两个子系统：
- **ScheduleOrchestrator**：有状态的可变调度器，暴露为 LLM 可调用的工具方法。LLM 可以调用 `scheduleTags`、`scheduleIds`、`scheduleGroups`、`unschedule` 以及查询当前状态。这是子代理 LLM 用来请求相关文档的接口。
- **Resolution pipeline**：5 阶段无状态管线，处理调度状态：Collect（展开标签/分组为 ID）、Dedup（按 ID 去重）、Filter（检查生命周期活跃度和频率限制）、Sort（按优先级降序）、Load（内联内容或从磁盘读取）。

**第三层：registry-composer** — 将最终 prompt 组装为三个部分：目录表（所有可用条目的 markdown 表格）、注入的条目正文（当前已调度的条目，按优先级排序）以及基础 prompt（其中 `{{name}}` 占位符被解析为条目内容）。

### 条目的流转过程

```
注册（profile YAML 或代码）→ registry-storage（JSONL + 索引）
  → LLM 通过 orchestrator 工具调度 → ScheduleState
  → registry-engine 解析（Collect→Dedup→Filter→Sort→Load）→ ResolvedEntry[]
  → registry-composer 组装（ToC + 注入条目 + 占位符解析后的 prompt）
  → 最终 prompt 交付给 LLM
```

### LLM 何时应使用 Schedule 工具

如果你是子代理 LLM，看到列有可用文档条目的"ToC"部分时，调用 orchestrator 的 `scheduleTags`、`scheduleIds` 或 `scheduleGroups` 方法来请求与当前任务相关的条目。系统将在下一轮将它们的完整内容注入到你的 prompt 中。使用 `unschedule` 移除不再需要的条目。

---

## 已移除的生命周期脚本系统

生命周期脚本已不属于本项目。工具执行由显式 action 参数和 policy engine 控制。Prompt/context 注入由 profile placeholders 和 Prompt Registry 负责。

---

## 策略系统

### 策略控制什么

策略定义了子代理的允许操作范围。在每次工具调用时（工具实际执行之前）进行评估。检查的 7 个维度包括：

1. **工具名白名单**：允许哪些工具名
2. **文件路径限制**：基于 glob 的路径匹配，含排除规则
3. **Bash 命令过滤**：精确匹配、前缀匹配和 glob 转正则的命令匹配
4. **Bash 路径提取**：捕获重定向目标和路径参数
5. **网络访问**：域名、端口和协议的访问限制
6. **环境变量访问**：允许/拒绝列表
7. **嵌套子代理调用**：是否可以递归调用 `efficiency_subagent`

### 策略解析机制

策略来自两个来源：profile 定义（YAML 前置元数据）和项目配置（`.pi/efficiency-subagent/config.json`）。`mergePolicies()` 函数将它们合并为单一的 `MergedPolicy`。`evaluate()` 函数随后将每个工具调用的 `ActionContext` 对照合并后的策略进行检查，返回允许/拒绝决定及原因字符串。

项目策略缺失或无效时会优雅降级为 `null`，意味着"全部放行"。Profile 级别的策略始终生效。

### 如何配置

在 profile YAML 中，通过 `policy` 键定义策略。在项目配置 JSON 中，定义一个 `PolicyEntry` 对象组成的 `policies` 数组。两者使用相同的 `PolicyEntry` 结构，包含 `allowTools`、`denyTools`、`allowPaths`、`denyPaths`、`allowBash`、`denyBash`、`allowDomains`、`denyDomains`、`allowEnv`、`denyEnv` 等字段。

---

## Session 续跑

### runId 工作原理

每次调用都会产出一个 run ID。命名方案为 `{profileName}-{taskSlug}-{ISOtimestamp}-{6位十六进制后缀}`。这确保了唯一性，同时保持人类可读。

当你提供 `runId` 参数时，系统会：
1. 验证运行目录存在
2. 从 `session.json` 恢复 session 元数据
3. 从 `slots.json` 反序列化 slot 状态（slot 值、堆栈、placeholder、TTL 信息）
4. 恢复 registry 频率计数器，使使用限制得以延续
5. 检查 profile 名称是否匹配（一致性检查）

子代理随后就像从未停止一样继续运行，拥有之前运行的完整上下文。

### Handoff 格式

每次运行完成后，系统会向运行目录写入 `handoff.md` 文件。该文件包含以下结构化部分：

- **运行元数据**：runId、profile 名称、task、状态、时间戳
- **涉及文件**：运行期间修改的文件列表
- **工具使用摘要**：各工具调用次数、成功/失败率
- **产出物**：生成文件的路径
- **阻断上下文**：子代理停止时正在做什么，包括最后操作和遇到的策略阻断

handoff 设计为供 LLM 在下一次调用时读取。将其作为上下文传入即可无缝继续。

### 恢复运行

恢复运行：调用 `efficiency_subagent`，`profile` 设为相同 profile，`task` 描述继续内容（如 "Continue previous work"），`runId` 设为之前运行的 ID。系统恢复所有状态，LLM 接收到 handoff 内容。

---

## 常见模式

### 典型工作流

1. **创建 profile**：在 `.profiles/worker.md` 中使用 YAML 前置元数据定义工具、placeholder、registry 条目和 prompt 正文。
2. **配置项目策略**（可选）：在 `.pi/efficiency-subagent/config.json` 中限制子代理的操作范围。
3. **调用子代理**：使用 `profile: "worker"` 和 `task: "do X"` 调用 `efficiency_subagent`。
4. **阅读 handoff**：运行后，查看 `.pi/subagents/runs/{runId}/handoff.md` 中的结构化摘要。
5. **续跑**：再次调用并传入 `runId` 从中断处继续。
6. **回顾**：阅读 `transcript.md` 查看人类可读的事件日志，或 `events.jsonl` 查看机器可读的数据。

### Profile 编写模式

一个 profile markdown 文件有两部分：YAML 前置元数据（位于 `---` 标记之间）和 markdown 正文。前置元数据声明子代理的工具列表、placeholder 值和 registry 条目。正文作为附加上下文。结构示例：

```yaml
name: worker
description: 通用子代理
systemPrompt: "You are a helpful coding assistant."
tools: [read, write, bash, glob, grep]
placeholders:
  workspace: "/home/user/project"
registry:
  - name: coding-guidelines
    type: guideline
    priority: 10
    content: "Always write tests first."
```

## 重要约束

### 无 OS 级沙箱

该插件不提供 OS 级或容器级沙箱。它运行在 PI Coding Agent 的扩展系统内部，这意味着它继承宿主进程的权限。策略引擎提供的是**逻辑层**沙箱（阻止工具调用、路径、网络访问等），但这是一个软边界。不要依赖它来防御恶意载荷的安全隔离。

### 工具白名单

子代理只能访问其 profile 的 `tools` 数组中列出的工具。如果某个工具不在白名单中，就无法被调用。策略引擎可以进一步限制即使是已允许的工具（例如拒绝特定文件路径或 bash 命令）。

### 文件路径限制

所有文件操作（读取、写入、glob、grep）都受路径策略约束。路径通过 glob 模式（`*`、`**`）匹配，显式排除优先于包含。工作目录始终是调用时指定的项目根目录。

### 无多代理工作流编排

这是一个单 profile、单运行的系统。没有 planner-router 图，没有多代理编排，没有基于 DAG 的工作流执行。对于多步骤管道，使用 `runId` 多次调用子代理来链式执行。

### 无内置 Profile

插件不附带任何内置 profile。所有 profile 必须由用户在 `.profiles/*.md` 中创建。

### 仅扩展部署

该插件通过 symlink 或 `--extension` 标志作为 PI Coding Agent 扩展加载。它不是独立的二进制文件、npm 包或 Docker 镜像。它依赖宿主的 `@earendil-works/pi-coding-agent` API。

### 确定性 Run ID 命名

Run ID 使用完整名称的 SHA-256 截断哈希来确保唯一性。不要解析 run ID 来获取 profile 名称和大致时间戳之外的更多含义。十六进制后缀不是序列号。

### Slot 状态是模块级可变的

prompt-engine 维护可变模块级状态（slots、stacks、placeholders、event log）。这意味着 slot 状态在同一进程生命周期内的多次调用之间会持续存在。在每次工具调用开始时调用 `reset()` 来清除旧状态，或使用 `serializeSlots()`/`deserializeSlots()` 进行显式生命周期控制。

---

## 延伸阅读

- **L2 模块文档**：`docs/L2-modules/` — 详细模块级文档，含完整 API 接口
- **L3 架构文档**：`docs/L3-architecture/` — 分层分类和边界分析
- **L1 文件文档**：`docs/L1-files/` — 按文件源码级文档，含行号引用

如需任何模块的完整 API 接口，请阅读对应的 L2 文档。如需了解模块如此分类的架构原因，请阅读 L3 文档。
