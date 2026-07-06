# Block Agent Core

**block-agent-core** 是一个基于 PI Coding Agent SDK 的会话优先（session-first）运行时，提供持久化会话管理、上下文分支切换和完整的可观测事件系统。

---

## 目录

- [特点](#特点)
- [目录结构](#目录结构)
- [快速开始](#快速开始)
- [工具接口](#工具接口)
- [许可证](#许可证)

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

## 目录结构

```
block-agent-core/
├── src/
│   ├── session/        # Session 系统核心 —— 持久化会话管理、PI SDK 执行引擎、上下文组装。项目当前的主要功能模块。
│   ├── turn/           # Turn 系统（遗留）—— 基于回合的记录模型，管理模板、配方、工具调用记录。与 session 系统独立，无耦合。
│   ├── adapter/        # 适配层 —— 封装 PI SDK 调用，提供统一的 runSubagentWithPiSdk 接口。
│   ├── tool/           # MCP 工具层 —— block_agent_core 工具的注册、路由、action 处理器。
│   │   └── actions/
│   ├── utils/          # 通用工具函数 —— JSONL 读写、日期格式化、数字范围序列化、glob 匹配、TOML 解析。
│   └── index.ts        # 公共 API 出口
├── docs/               # 用户手册与文档。
├── skills/             # PI 技能定义（如 better-subagent）。
└── reports/            # 审计与设计报告。
```

| 目录 | 说明 | README |
|------|------|--------|
| [`src/session/`](src/session/README.md) | Session 系统核心。持久化会话管理、PI SDK 执行引擎、上下文组装。这是项目当前的主要功能模块。 | [src/session/README.md](src/session/README.md) |
| [`src/turn/`](src/turn/README.md) | Turn 系统（遗留）。基于回合的记录模型，管理模板、配方、工具调用记录。与 session 系统独立，无耦合。 | [src/turn/README.md](src/turn/README.md) |
| [`src/adapter/`](src/adapter/README.md) | 适配层。封装 PI SDK 调用，提供统一的 `runSubagentWithPiSdk` 接口。 | [src/adapter/README.md](src/adapter/README.md) |
| [`src/tool/`](src/tool/README.md) | MCP 工具层。`block_agent_core` 工具的注册、路由、action 处理器。 | [src/tool/README.md](src/tool/README.md) |
| [`src/utils/`](src/utils/README.md) | 通用工具函数。JSONL 读写、日期格式化、数字范围序列化、glob 匹配、TOML 解析。 | [src/utils/README.md](src/utils/README.md) |
| [`docs/`](docs/README.md) | 用户手册与文档。 | [docs/README.md](docs/README.md) |
| [`skills/`](skills/README.md) | PI 技能定义目录。 | [skills/README.md](skills/README.md) |
| [`reports/`](reports/README.md) | 审计与设计报告。 | [reports/README.md](reports/README.md) |

### 模块职责速览

```
              ┌─────────────────────────────────────────────────────┐
              │                      tool/                          │
              │   MCP 工具入口 —— 注册 block_agent_core 工具       │
              │   接收请求并路由到对应 action 处理器                │
              └──────────┬──────────────────────────┬───────────────┘
                         │                          │
              ┌──────────▼──────────┐   ┌──────────▼──────────┐
              │      session/       │   │       turn/          │
              │   Session 系统核心   │   │  Turn 系统（遗留）    │
              │   会话管理 / 执行引擎 │   │  回合记录 / 模板     │
              │   上下文调度器        │   │  配方 / 工具调用      │
              └──────────┬──────────┘   └──────────┬──────────┘
                         │                          │
              ┌──────────▼──────────────────────────▼──────────┐
              │                 session/ + turn/                │
              │    共享类型、prompt 构建、消息树、归档存储等      │
              └──────────────────────┬─────────────────────────┘
                         │                          │
              ┌──────────▼──────────┐   ┌──────────▼──────────┐
              │      adapter/       │   │       utils/         │
              │  PI SDK 统一封装     │   │   JSONL / 日期 /     │
              │  runSubagentWithPiSdk│   │   glob / TOML 等     │
              └─────────────────────┘   └──────────────────────┘
```

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
