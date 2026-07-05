# block-agent-core 改进方向

> 2026-07-05 头脑风暴产出，按价值/成本分层排列。

---

## 符号说明

- **价值**: ★★★ 关键 | ★★ 重要 | ★ 锦上添花
- **成本**: $ <2h | $$ <1天 | $$$ 多天
- **已有基础** → 可复用的现有代码

---

## Tier 1 — 高价值、低成本（优先实施）

### T1-1 `delete_session` ★★★ $

可以 create 但不能 delete，session 只增不减。

- 新文件: `tool/actions/delete-session.ts`
- 核心: `core/session-store.ts` 加 `removeSession(cwd, sessionId)` 递归删除 session 目录
- 注意: 是否检查有正在运行的 send？建议硬删除，保持简单

### T1-2 关键模块单元测试 ★★★ $$

13 个源文件无对应测试，优先级：

1. `utils/range-utils.ts` — 纯函数，最易测
2. `core/message-tree.ts` — 树操作，影响 unmount 正确性
3. `core/session-runtime.ts` — 执行引擎核心，需 mock PI SDK
4. `tool/actions/send-task.ts` — 最重要的 action handler
5. `adapter/pi-sdk.ts` — PI SDK 集成，可用 mock

### T1-3 Session 标签/备注 ★★ $

session 多了无法区分用途。

- `SessionSystemConfig` 加 `tags: string[]` 和 `note?: string`
- `list_sessions` 支持按 tag 过滤
- `session-store.ts` 已有 `tags` 字段在 message 层面，扩展即可

### T1-4 Token 用量统计 ★★★ $

`onEvent` 回调已接收 PI SDK 事件，只需记录。

- `SessionMessageRecord` 或 event payload 加 `usage: { inputTokens, outputTokens }`
- `send_finished` event payload 加 token 汇总
- 管道: `adapter/pi-sdk.ts` (采集) → `session-runtime.ts` (记录) → `session-store.ts` (持久化)

### T1-5 执行时间记录 ★★ $

`durationMs` 已存在 tool block 上，扩展到 send 级别即可。

- `send_finished` event payload 加 `durationMs`
- `session-runtime.ts` 用 `performance.now()` 包裹 `executeSessionTask`
- `SessionMessageRecord`（kind: tool_call）加 `startedAt` / `finishedAt`

### T1-6 错误分类 ★★ $

当前 `error: boolean` 无法区分可重试和不可重试。

- `SessionMessageRecord`（kind: tool_call）加 `errorCode: string` 和 `errorCategory: "transient" | "terminal" | "resource_exhausted"`
- `adapter/pi-sdk.ts` 映射 PI SDK 错误到分类
- `session-runtime.ts` 用分类决定重试策略

### T1-7 可配置超时 ★★★ $

`AbortSignal` 已收到但被丢弃，PI SDK 调用无超时保护。

- `SessionSendRequest` 加 `timeoutMs`
- `SessionSystemConfig` 加 `defaultTimeoutMs`
- `adapter/pi-sdk.ts` 用 `AbortController` 竞速超时
- `SubagentToolSelection` 加 `toolTimeoutMs`

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
- 参数: `sessionId`, `query?`, `kind?`, `toolName?`, `filePath?`, `turnId?`
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

- 依赖 T1-4 (token 统计)
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
| Phase 1 | T1-1 delete + T1-2 测试 + T1-4 Token + T1-7 超时 | Week 1-2 |
| Phase 2 | T1-3 标签 + T1-5 计时 + T1-6 错误分类 + T2-8 流式 | Week 3-4 |
| Phase 3 | T2-1 分叉 + T2-2 检查点 + T2-3 调度持久化 | Week 5-6 |
| Phase 4 | T2-4 幂等 + T2-5 上下文预算 + T2-10 清理 | Week 7-8 |
| Phase 5+ | T3 各项按需推进 | Month 3+ |

---

## 存档

### 已发现并修复的 Bug

| # | 描述 | 状态 |
|---|------|------|
| 1 | `unmountContext` 返回类型 `removedIds` 重复 key | ✅ 已修复 (2026-07-05) |
| 2 | `AbortSignal` 丢弃 | 🟡 功能缺失，非 bug |
| 3 | 文件锁仅进程内 | 🟡 设计限制，已写入文档 |
| 4 | system_prompt 未入 messages（文档错误）| ✅ 已修正文档 (2026-07-05) |
| 5 | tool-calls.jsonl + file-calls.jsonl 合并到 messages.jsonl | ✅ 已完成 (2026-07-05) |

### 预存的 tsc 问题（不影响运行，待修复）

（无——上次重构已修复 `toolCallSeq`/`fileCallSeq` 误名 bug）
