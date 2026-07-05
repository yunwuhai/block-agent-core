# block-agent-core 改进方向

> 2026-07-05 头脑风暴产出，按价值/成本分层排列。

---

## 符号说明

- **价值**: ★★★ 关键 | ★★ 重要 | ★ 锦上添花
- **成本**: $ <2h | $$ <1天 | $$$ 多天
- **已有基础** → 可复用的现有代码

---

## Tier 1 — 高价值、低成本（优先实施）

### T1-1 Token 用量统计 ★★★ $

`onEvent` 回调已接收 PI SDK 事件，只需记录。

- `SessionMessageRecord`（kind: reply）加 `usage: { inputTokens, outputTokens }`
- 每个 turn 结束时随 reply 消息一起持久化，区分输入/输出 token
- 管道: `adapter/pi-sdk.ts` (采集) → `session-runtime.ts` (记录到 reply 消息)

### T1-2 执行时间记录 ★★ $

Turn 级别和 tool 级别分开记录。

- `SessionMessageRecord`（kind: reply）加 `durationMs` — 整个 turn 的耗时
- `SessionMessageRecord`（kind: tool_call）加 `startedAt` / `finishedAt` — 单个工具耗时
- `session-runtime.ts` 用 `Date.now()` 包裹关键路径

### T1-3 可配置超时 ★★★ $

`AbortSignal` 已在 adapter 层实现，通过 `AbortController` 竞速超时。

- `SessionSendRequest` 加 `timeoutMs` — 请求级超时
- `SessionSystemConfig` 加 `defaultTimeoutMs` — 会话级默认超时
- `adapter/pi-sdk.ts` 用 `AbortController` 竞速超时（PI SDK 无原生超时支持）
- 优先级: request.timeoutMs > config.defaultTimeoutMs

### T1-4 关键模块单元测试 ★★★ $$

13 个源文件无对应测试，优先级：

1. `utils/range-utils.ts` — 纯函数，最易测
2. `core/message-tree.ts` — 树操作，影响 unmount 正确性
3. `core/session-runtime.ts` — 执行引擎核心，需 mock PI SDK
4. `tool/actions/send-task.ts` — 最重要的 action handler
5. `adapter/pi-sdk.ts` — PI SDK 集成，可用 mock

---

## Tier 2 — 中等价值、中等成本

### T2-1 Session 分叉 ★★★ $$

从某个 turn 点复制出独立 session。

- 新文件: `tool/actions/fork-session.ts`
- 核心: `core/session-store.ts` 加 `forkSession(cwd, sourceSessionId, opts)`
- 复制: `system-config.json` + 指定点之前的所有 JSONL 数据
- 记录 `session_forked` event（源 + 目标 session）

### T2-2 命名检查点 ★★★ $$

给 activeMessageIds 打 tag，支持 git-like 回退。

- 新文件: `tool/actions/checkpoint.ts`
- 核心: `core/session-store.ts` `createCheckpoint(label)` / `restoreCheckpoint(label)`
- 存储: `system-config.json` 的 `checkpoints` 字段
- 复用: `compressMessageRanges` / `expandMessageIdRanges`

### T2-3 调度器持久化 ★★★ $$

`TaskScheduler` 纯内存，进程崩溃丢失所有任务。

- `TaskScheduler` 加 `serialize()` / `deserialize()`
- 存为 `.block-agent-core/scheduler/checkpoint.jsonl`
- 启动时恢复，检测 running 状态的任务并重试或标记 lost

### T2-4 幂等键 ★★ $$

SDK 重连可能导致同一工具调用执行两次。

- `SessionMessageRecord`（kind: tool_call）加 `idempotencyKey`
- `appendSessionMessage` 检测重复 key 返回已有记录
- `adapter/pi-sdk.ts` 为每个 tool execution 生成幂等 key

### T2-5 上下文窗口预算 ★★ $$

session 无限增长会超出模型上下文窗口。

- `SessionSystemConfig` 加 `contextWindowBudget: number`（tokens）
- 每次 send 前计算 token 数，超出则驱逐最旧的非固定消息
- 发出 `compaction_evicted` event
- 复用: `compressMessageRanges`、`readCurrentContextState`

### T2-6 消息内容搜索 ★★ $$

只能全量读 messages，无法按条件查询。

- 新文件: `tool/actions/search-messages.ts`
- 参数: `sessionId`, `query?`, `kind?`, `toolName?`, `turnId?`
- 实现: 内存扫描 JSONL 文件（小规模足够）

### T2-7 Session 导入/导出 ★★ $$

无法跨机器迁移 session。

- 新文件: `tool/actions/export-import.ts`
- `export_session(sessionId, format: "json" | "tar")` → 打包
- `import_session(data, conflictStrategy)` → 解包
- 复用: `archive-store.ts` 已有导出逻辑

### T2-8 `read_events` 流式模式 ★★ $$

只能一次轮询，无增量查询。

- `read_events` 加 `since?: number` 参数（只返回该 event id 之后）
- 可选加 `block: true` 阻塞等待新事件
- 减少轮询传输量

### T2-9 结构化日志级别 ★ $

所有 event 平级，无法按严重程度过滤。

- `SessionEventRecord` 加 `level: "debug" | "info" | "warn" | "error"`
- 每个 event 类型设默认级别
- 可扩展到 stdout 镜像输出

### T2-10 Session 自动清理 ★★ $

无限增长的 session 目录。

- `SessionSystemConfig` 加 `ttlSeconds` / `expiresAt`
- `list_sessions` 返回过期状态
- `cleanup_sessions({ olderThan })` 批量删除

---

## Tier 3 — 高价值、高成本（长期规划）

### T3-1 并行子 Session (Fan-Out / Gather) ★★★ $$$

从父 session fork 多个子 session 并行执行后汇合。

- 新文件: `tool/actions/child-session.ts`、`core/orchestrator.ts`
- 子 session 继承父配置，独立 sessionId
- `gather` 函数等待所有子 session 完成
- 复用: `createSession`、`forkSession`

### T3-2 人机协作 (HITL) ★★★ $$$

关键操作暂停等待人工审批。

- 新文件: `tool/actions/resolve-interrupt.ts`
- `TaskScheduler` 加 pause/resume 能力
- policy 匹配 → 发出 `hitl_interrupt` event → 暂停执行 → 等待 `resolve_interrupt`
- 参考: LangGraph HITL 模式

### T3-3 Hook / Webhook 通知 ★★ $$$

send 完成后主动通知外部系统。

- 新文件: `core/subscriber.ts`、`tool/actions/subscribe.ts`
- session config 加 `hooks: { onSendFinished?: { url, headers } }`
- fire-and-forget HTTP POST（不做重试）
- 可扩展事件类型过滤

### T3-4 策略引擎 / 护栏 ★★ $$$

按规则限制工具使用（如 "生产环境禁止 bash"）。

- 新文件: `core/policy.ts`、`tool/actions/policy.ts`
- `Policy` 类型: 条件 (toolName, filePath, sessionTags) + 动作 (allow/deny/require_hitl)
- `session-runtime.ts` 在每次 tool call 前评估策略
- 复用: `normalizeToolNames`

### T3-5 成本追踪和预算 ★★★ $$$

按 session/子 agent 设定 token 预算，超支自动降级或停止。

- 依赖 T1-1 (token 统计)
- `SessionSystemConfig` 加 `budget: { maxTokens, maxCostUsd }`
- 累计用量存入 `SessionSystemConfig.usage`
- 超支时: emit `budget_exceeded` event → 截断上下文 / 降级模型 / 停止

### T3-6 Session 版本 / Diff ★ $$$

prompt 或工具变更后对比行为差异。

- `updateSessionConfig` 时 snapshot 旧配置
- 存为 `versions/` 子目录
- `diff_session_versions` 输出结构化差异

### T3-7 分布式追踪 (OpenTelemetry) ★★ $$$

跨 session 和工具调用的链路追踪。

- 新文件: `core/tracing.ts`
- `SessionEventRecord` 加 `traceId` / `spanId`
- 可选 `OpenTelemetryHook` 包裹 `executeSessionTask`
- 零依赖（不配置则不加载）

### T3-8 Session 模板 ★ $$

预定义 session 配置，减少重复设置。

- 新文件: `tool/actions/template.ts`
- `SessionTemplate` 类型存为 TOML 文件
- `create_session_from_template` 合并模板默认值 + 覆盖参数
- 复用: `utils/toml.ts`

### T3-9 Session 重放 / 时间旅行 ★★ $$$

基于 JSONL 事件重建历史状态。

- `core/session-runtime.ts` 加 `replay_session`
- 参数: `upToEventId?`, `pauseAtToolCall?`
- 复用 `readCurrentContextState` 重建状态
- 天然适合 append-only JSONL 模型

---

## 建议实施节奏

| 阶段 | 内容 | 时间 |
|------|------|------|
| Phase 1 | T1-1 Token + T1-2 计时 + T1-3 超时 + T1-4 测试 | Week 1-2 |
| Phase 2 | T2-1 分叉 + T2-2 检查点 + T2-3 调度持久化 | Week 3-4 |
| Phase 3 | T2-4 幂等 + T2-5 上下文预算 + T2-10 清理 | Week 5-6 |
| Phase 4 | T2-6 搜索 + T2-7 导入导出 + T2-8 流式 | Week 7-8 |
| Phase 5+ | T3 各项按需推进 | Month 3+ |

---

## 存档

### 已发现并修复的 Bug

| # | 描述 | 状态 |
|---|------|------|
| 1 | `unmountContext` 返回类型 `removedIds` 重复 key | ✅ 已修复 (2026-07-05) |
| 2 | `AbortSignal` 丢弃 | ✅ 已修复 (2026-07-05, T1-3) |
| 3 | 文件锁仅进程内 | 🟡 设计限制，已写入文档 |
| 4 | system_prompt 未入 messages（文档错误）| ✅ 已修正文档 (2026-07-05) |
| 5 | tool-calls.jsonl + file-calls.jsonl 合并到 messages.jsonl | ✅ 已完成 (2026-07-05) |

### 设计决策记录

| # | 决策 | 原因 | 日期 |
|---|------|------|------|
| 1 | 不实现 tags/notes/tag 过滤 | 属于上层业务逻辑，不应在 core 中实现 | 2026-07-06 |
| 2 | 不实现 delete_session | 中间删除会影响 id 连续性，暂时不需要 | 2026-07-06 |
| 3 | 不实现 file_call kind | read 工具 result 已包含完整文件内容，file_call 冗余 | 2026-07-06 |
| 4 | 不实现错误分类 | 功能用途和使用方式尚未理清，暂缓 | 2026-07-06 |
| 5 | Token 记录在 reply 消息上 | 每个 turn 独立，随 reply 一起持久化，区分 input/output | 2026-07-06 |
| 6 | 时间记录分两级 | reply.durationMs（turn 级）+ tool_call[startedAt/finishedAt]（工具级）| 2026-07-06 |
