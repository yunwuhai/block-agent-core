# Block Agent Core

**block-agent-core** 是一个基于 PI Coding Agent SDK 的会话优先（session-first）运行时，提供持久化会话管理、上下文分支切换和完整的可观测事件系统。

---

## 特点

### 1. 会话即文件，零依赖存储

每个会话是一个目录，包含三个文件，无需数据库：

```
.block-agent-core/sessions/<sessionId>/
├── messages.jsonl       # 消息体（input / reasoning / reply / tool_call）
├── events.jsonl         # 事件日志（send / mount / unmount 等）
└── system-config.json   # 系统配置（prompt、model、tools）
```

- 文件即状态：备份、迁移、diff 直接用标准文件工具
- Append-only 写入：天然支持审计追溯，无数据损坏风险
- 进程隔离：两个实例共享同一目录时可通过文件锁协调（当前进程内锁，计划中升级为跨进程锁）

### 2. 内联数据模型

一条 `tool_call` 消息就是一个 JSON 行，所有数据内联其中：

```json
{"kind":"tool_call","toolName":"read","toolParams":{...},"toolResult":{...},"toolError":false}
```

- 不再需要外键查找（去掉了 `toolCallId` / `fileCallId`）
- 读取一条消息就能获得所有上下文
- 消息自包含，便于导出、存档、重放

### 3. 上下文分支切换

通过 `mount_context` / `unmount_context` 可以在历史消息中自由切换上下文：

```
Turn1 → Turn2A → Turn2A 回复
                   ↓ 卸载 Turn2A
                → Turn2B → Turn2B 回复
                   ↓ 卸载 Turn2B
                → 重新挂载 Turn2A → Turn3 基于 Turn2A 回复
```

- 基于 `id` 范围的精准控制，而非整轮删除
- 适合 A/B 测试、多方案并行探索、分支修复场景

### 4. 完整的可观测事件系统

`events.jsonl` 记录会话生命周期的每一个关键节点：

| 事件 | 说明 |
|------|------|
| `send_enqueued` | 消息进入调度队列 |
| `send_started` | 消息开始执行 |
| `send_finished` | 执行完成（含模型、工具列表） |
| `send_status` | 执行统计（durationMs + inputTokens/outputTokens） |
| `tool_send_started` | 工具调用开始 |
| `tool_send_finished` | 工具调用结束（含 startedAt / finishedAt） |
| `manual_mount` / `manual_unmount` | 上下文挂载/卸载 |

每个事件记录 `createdAt`，构成完整的时间线。

### 5. 内置调度器

`TaskScheduler` 负责消息执行的排队和调度：

- 顺序执行：同一 session 的消息按入队顺序执行
- 重试支持：失败任务可配置重试策略
- 并行隔离：不同 session 的任务互不阻塞

### 6. 双 SDK 模式

| 模式 | 说明 | 适用场景 |
|------|------|---------|
| `host-inherit` | 复用宿主 PI 运行时的模型注册表和认证环境 | 插件/扩展场景 |
| `standalone-sdk` | 独立创建 SDK 实例，指定模型和认证配置 | 独立 CLI / 服务端场景 |

---

## 前景

### 短期方向

- **Session 分叉**：从任意历史点 fork 出独立 session，支持并行实验
- **命名检查点**：为上下文状态打标签，支持 git-like 回退
- **调度器持久化**：进程重启后恢复未完成的任务
- **幂等键**：防止 SDK 重连导致工具调用重复执行
- **上下文窗口预算**：自动压缩超出模型窗口的消息

### 长期方向

- **并行子 Session**：从父 session fork 多个子 session 并行执行后汇合（fan-out / gather）
- **人机协作**：关键操作暂停等待人工审批（HITL）
- **策略引擎**：按规则限制工具使用（如"生产环境禁止 bash"）
- **成本追踪**：按 session 设定 token 预算，超支自动降级
- **分布式追踪**：跨 session 和工具调用的链路追踪（OpenTelemetry）

---

## 快速开始

```bash
# 安装依赖
bun install

# 运行测试
bun test

# 类型检查
bunx tsc --noEmit
```

## 工具接口

```typescript
// 注册单个 tool，支持以下 actions:
create_session    // 创建新会话
get_session       // 读取会话配置
list_sessions     // 列出所有会话
update_session    // 更新会话配置（prompt、model、tools）
send_message      // 发送消息（含调度器排队）
mount_context     // 挂载上下文（source 或历史 id 范围）
unmount_context   // 卸载上下文
list_context_mounts // 列出已挂载上下文
read_events       // 读取事件（可按 turnId 过滤）
list_models       // 列出可用模型
archive_session   // 归档会话
```

## 许可证

MIT
