# session/ — Session 系统核心

会话优先（session-first）运行时核心模块。提供持久化会话管理、PI SDK 执行引擎、上下文组装与调度。

---

## 文件清单

### `types.ts` — Session 系统核心类型定义

| 导出 | 说明 |
|------|------|
| `SessionSdkMode` | `"host-inherit"` / `"standalone-sdk"` |
| `SessionMessageKind` | 消息类别：`"input"` / `"reasoning"` / `"reply"` / `"tool_call"` |
| `StandaloneSdkOptions` | 独立 SDK 配置（模块路径、认证存储、模型选择） |
| `ContextMount` | 上下文挂载记录（id、sources、idRanges、metadata） |
| `SessionSystemConfig` | 会话系统配置（sessionId、prompt、model、tools、sdkMode） |
| `SessionMessageRecord` | 消息记录（turnId、id、kind、text、parentId、toolName/Params/Result/Error、时间戳） |

### `store.ts` — JSONL 文件读写与会话 CRUD

| 导出 | 说明 |
|------|------|
| `acquireFileLock` / `releaseFileLock` | 进程内文件锁（基于 Promise 链） |
| `readJsonl` / `writeJsonl` / `appendJsonl` | JSONL 文件底层读写 |
| `ensureParentFile` | 确保父目录存在并初始化文件 |
| `readSessionConfig` / `writeSessionConfig` | 会话配置读写 |
| `createSessionLayout` / `createSession` | 创建会话目录结构与新会话 |
| `readMessages` / `appendSessionMessage` | 消息读写 |
| `readEvents` / `appendSessionEvent` | 事件读写 |
| `allocateTurnId` | 分配自增 turn id |
| `listSessions` | 列出所有会话 |
| `removeSessionMessagesById` | 按 id 级联删除消息 |
| `getCurrentParentSequence` | 获取当前活跃消息的父序列 |
| `updateSessionConfig` | 更新会话配置 |

### `context-state.ts` — 上下文状态管理

| 导出 | 说明 |
|------|------|
| `readCurrentContextState` | 读取当前上下文状态（挂载列表 + 活跃消息 id 集合） |
| `mountContext` | 挂载上下文（source 文件加载或历史 id 范围挂载） |
| `unmountContext` | 卸载上下文（删除指定挂载点及其关联消息） |
| `listContextMounts` | 列出所有已挂载上下文 |
| `parseContextMount` | 解析 payload 为 ContextMount 对象 |

### `runtime.ts` — 执行引擎

| 导出 | 说明 |
|------|------|
| `SessionTaskRunnerResult` | 执行结果（继承 PiSdkRunResult） |
| `SessionTaskRunnerDeps` | 执行依赖接口（composeContextText、runWithSdk） |
| `SessionSendRequest` | 发送请求（turnId、inputText、parentId、临时 source） |
| `SessionTaskExecutionResult` | 执行结果（turnId、model、tools、prompt、usage、durationMs） |
| `createInputMessage` | 创建输入消息记录 |
| `rollbackCreatedInputArtifacts` | 回滚已创建的消息制品 |
| `executeSessionTask` | 执行会话任务（组装 prompt → 调用 SDK → 保存结果） |

### `context-sources.ts` — 上下文源加载器

| 导出 | 说明 |
|------|------|
| `JsonlFieldsSource` | JSONL 字段源类型（filePath、fieldOrder、recordIds、tags） |
| `FileSliceSource` | 文件切片源类型（filePath、lines） |
| `CustomContextSource` | 自定义上下文源 |
| `ContextSource` | 联合类型 = `JsonlFieldsSource \| FileSliceSource \| CustomContextSource` |
| `ContextSourceLoader` | 加载器函数类型 |
| `ContextLoaderRegistry` | 加载器注册表 |
| `getValueByKeyPath` | 按点分路径从对象取值 |
| `formatValue` | 格式化值为字符串 |
| `hasMatchingTags` | 标签匹配判断 |
| `loadJsonlFields` | JSONL 字段加载器 |
| `loadFileSlice` | 文件切片加载器 |
| `composeContext` | 组装多个 source 为最终上下文字符串 |

### `archive-store.ts` — 运行归档存储

| 导出 | 说明 |
|------|------|
| `ArchiveLayout` | 归档目录结构（rootDir、messagesPath、toolCallsPath、fileCallsPath） |
| `ReasoningRecord` | 推理记录 |
| `ReplyRecord` | 回复记录 |
| `MessageRecord` | 联合类型 = `ReasoningRecord \| ReplyRecord` |
| `ToolCallTrace` | 工具调用追踪记录 |
| `ExternalFileAccessRecord` | 外部文件访问记录 |
| `SaveSubagentResultInput` | 保存 subagent 运行结果的输入类型 |

### `message-tree.ts` — 消息树工具

| 导出 | 说明 |
|------|------|
| `buildChildrenMap` | 构建消息的父子关系映射 |
| `collectDescendantIds` | 收集指定起始 id 的所有后代 id |
| `removeIdsAndDescendants` | 从活跃集合中删除指定 id 范围及其所有后代 |

### `task-scheduler.ts` — 任务调度器

| 导出 | 说明 |
|------|------|
| `ScheduledTaskHandle` | 调度任务句柄（taskId、sessionId、execute） |
| `TaskSchedulerSnapshot` | 调度器快照（maxRunning、runningCount、queuedCount） |
| `TaskScheduler` | 任务调度器类（enqueue / snapshot / 并发控制 / 会话级串行） |

### `pi-config.ts` — PI SDK 执行配置构建

| 导出 | 说明 |
|------|------|
| `SubagentExecutionConfig` | 执行配置（cwd、model、outputMode、maxTurns） |
| `BuildSubagentInvocationInput` | 构建输入（task、context、systemPrompt、execution） |
| `SubagentInvocation` | 调用配置（prompt、execution） |
| `buildSubagentPrompt` | 构建 subagent 提示词（systemPrompt + context + task） |
| `buildSubagentInvocation` | 构建完整 subagent 调用配置 |

### `subagent-run.ts` — Subagent 工具/模型选择类型

| 导出 | 说明 |
|------|------|
| `PI_BUILTIN_TOOLS` | PI 内置工具列表 |
| `PI_DEFAULT_SUBAGENT_TOOLS` | Subagent 默认工具列表 |
| `SubagentModelSelection` | 模型选择策略：`current` / `default` / `specific` |
| `SubagentToolSelection` | 工具选择（names） |
| `SubagentRunRequest` | Subagent 运行请求 |
| `normalizeToolNames` | 标准化工具名称列表 |
