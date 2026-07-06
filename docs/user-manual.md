# Block Agent Core 用户手册

## 概述

block-agent-core 是一个**会话运行时库**，为上层应用提供持久化会话管理、消息执行调度和上下文控制能力。上层应用通过调用其公开的 action 函数来驱动 PI Coding Agent 的会话生命周期。

---

## 架构分层

```
┌─────────────────────────────────────────────────┐
│                  上层应用                         │
│  （CLI / GUI / 自动化脚本 / 其他 Agent 系统）      │
├─────────────────────────────────────────────────┤
│              block-agent-core                   │
│  ┌─────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ 会话存储  │ │ 执行引擎  │ │  调度器           │  │
│  │ session- │ │ session- │ │  task-scheduler  │  │
│  │ store.ts │ │ runtime  │ │                  │  │
│  └─────────┘ └──────────┘ └──────────────────┘  │
├─────────────────────────────────────────────────┤
│           PI Coding Agent SDK                   │
│  （模型调用、工具执行、流式事件）                   │
└─────────────────────────────────────────────────┘
```

上层应用只需要：
1. 调用 `tool/actions/` 下的 action 函数
2. 监听和处理返回结果
3. 读取 `messages.jsonl` / `events.jsonl` 获取会话数据

---

## 会话生命周期

### 创建会话

```typescript
import { handleCreateSession } from "block-agent-core/tool/actions/create-session";

const response = await handleCreateSession({
  sessionId: "my-session",
  systemPromptFilePaths: ["/path/to/prompt.md"],
  sdkMode: "host-inherit",
  tools: { names: ["read", "grep", "bash"] },
  modelSelection: {
    strategy: "specific",
    provider: "deepseek",
    modelId: "deepseek-v4-flash",
  },
}, ctx);
```

成功后会在 `.block-agent-core/sessions/my-session/` 下生成三个文件。

### 发送消息

```typescript
import { handleSendMessage } from "block-agent-core/tool/actions/send-task";

const response = await handleSendMessage({
  sessionId: "my-session",
  inputText: "请分析当前目录的代码结构",
  temporarySources: [{ type: "file", filePath: "/path/to/src/" }],
}, ctx);

// 返回结果包含:
const { send } = JSON.parse(response.data);
// { sessionId, turnId, status, queuePosition, registeredAt, inputId }
```

`send_message` 是异步的——消息进入调度队列后立即返回 `status: "queued"`。执行完成后事件系统会记录结果。

### 读取事件

轮询 `events.jsonl` 获取执行结果：

```typescript
import { handleReadEvents } from "block-agent-core/tool/actions/read-events";

const response = await handleReadEvents({
  sessionId: "my-session",
  turnId: 1,  // 可选过滤
}, ctx);

// 返回所有事件，包括 send_finished、send_status 等
```

事件结构：

```json
{"turnId":1,"id":5,"type":"send_finished","payload":{"status":"completed",...},"createdAt":"..."}
{"turnId":1,"id":6,"type":"send_status","payload":{"durationMs":7252,"inputTokens":80,"outputTokens":532},"createdAt":"..."}
```

### 读取消息

```typescript
import { readMessages } from "block-agent-core/core/session-store";

const messages = await readMessages(ctx.cwd, "my-session");
// messages 是按 id 排序的 SessionMessageRecord[] 数组
```

### 归档会话

```typescript
import { handleArchiveSession } from "block-agent-core/tool/actions/archive-session";

const response = await handleArchiveSession({
  sessionId: "my-session",
  format: "json",
}, ctx);
```

---

## 上下文分支切换

这是 block-agent-core 的核心能力之一，适合需要**在历史的不同分支上继续对话**的场景。

### 场景示例

```
Turn1 (用户提问) → Turn2 (基于 Turn1 回答)
                → Turn3 (基于 Turn1 走不同方向)
                → 回到 Turn2 基础上继续 Turn4
```

### 实现方式

```typescript
// 1. 先发送两条消息
await handleSendMessage({ sessionId, inputText: "问题 A" }, ctx);
// Turn1 完成，activeMessageIds = [1, 2, 3]

await handleSendMessage({ sessionId, inputText: "修复方案" }, ctx);
// Turn2 完成，activeMessageIds = [1, 2, 3, 4, 5, 6]

// 2. 卸载 Turn2（移除 [4, 6] 范围内的消息）
await handleUnmountContext({ sessionId, idRanges: [[4, 6]] }, ctx);
// activeMessageIds = [1, 2, 3]

// 3. 在 Turn1 基础上走不同方向
await handleSendMessage({ sessionId, inputText: "架构分析" }, ctx);
// Turn3 完成，activeMessageIds = [1, 2, 3, 7, 8, 9]

// 4. 卸载 Turn3，重新挂载 Turn2
await handleUnmountContext({ sessionId, idRanges: [[7, 9]] }, ctx);
await handleMountContext({ sessionId, idRanges: [[4, 6]] }, ctx);
// activeMessageIds = [1, 2, 3, 4, 5, 6]

// 5. 基于 Turn2 继续
await handleSendMessage({ sessionId, inputText: "验证修复" }, ctx);
// Turn4 完成，上下文包含 Turn1 + Turn2，不含 Turn3
```

### 关键规则

- `mount_context` 支持两种模式：
  - `sources` — 挂载外部文件作为上下文
  - `idRanges` — 挂载历史消息范围
- `unmount_context` 移除指定 `idRanges` 及其所有后代消息
- 当前激活的上下文状态可通过 `readCurrentContextState()` 获取
- 每次 `send_finished` 事件会记录当前的 `activeMessageIdRanges`

---

## 事件系统

`events.jsonl` 是上层应用获取执行状态的主要途径。

### 完整事件列表

| 事件类型 | 触发时机 | 关键 payload 字段 |
|---------|---------|-----------------|
| `session_initialized` | 会话创建 | systemPromptFilePaths, sdkMode |
| `session_config_updated` | 配置更新 | 变更的字段 |
| `send_enqueued` | 消息入队 | queuePosition, inputId |
| `send_started` | 消息开始执行 | inputId, sentMessageIdRanges |
| `send_finished` | 执行完成 | status, outputMessageIdRanges, model, tools |
| `send_status` | 执行统计 | durationMs, inputTokens, outputTokens |
| `tool_send_started` | 工具调用开始 | messageId, toolName |
| `tool_send_finished` | 工具调用结束 | messageId, toolName, isError, startedAt, finishedAt |
| `manual_mount` | 手动挂载 | mount 详情 |
| `manual_unmount` | 手动卸载 | idRanges |

### 状态推导

事件系统的设计原则是：**当前状态可通过重放事件推导**。例如：

- 当前激活的消息 ID 范围 = 最近一次 `send_finished` 的 `activeMessageIdRanges`
- 如果之后有 `manual_unmount`，则减去对应范围
- 如果之后有 `manual_mount`（通过 `idRanges`），则加上对应范围

```typescript
import { readCurrentContextState } from "block-agent-core/core/session-store";

const state = await readCurrentContextState(cwd, sessionId);
// { activeMessageIds: number[] }
```

---

## 文件存储模型

```
.block-agent-core/sessions/<sessionId>/
├── messages.jsonl       # 消息体
├── events.jsonl         # 事件日志
└── system-config.json   # 会话配置
```

### messages.jsonl

每条消息是一个 JSON 行：

```json
{"turnId":1,"id":1,"kind":"input","text":"你好"}
{"turnId":1,"id":2,"parentId":1,"kind":"reasoning","text":"思考过程..."}
{"turnId":1,"id":3,"parentId":2,"kind":"tool_call","toolName":"read","toolParams":{...},"toolResult":{...},"toolError":false}
{"turnId":1,"id":4,"parentId":3,"kind":"reply","text":"最终回复"}
```

消息 `id` 是单调递增的整数，`parentId` 指向父消息构成消息树。

### events.jsonl

每条事件是一个 JSON 行，`createdAt` 在末尾：

```json
{"turnId":1,"id":1,"type":"send_enqueued","payload":{...},"createdAt":"2026-07-06T10:00:00.000+08:00"}
```

### system-config.json

```json
{
  "sessionId": "my-session",
  "systemPromptFilePaths": ["/path/to/prompt.md"],
  "sdkMode": "host-inherit",
  "nextTurnId": 5,
  "modelSelection": { "strategy": "specific", "provider": "deepseek", "modelId": "deepseek-v4-flash" },
  "tools": { "names": ["read", "grep", "bash"] }
}
```

---

## 开发上层应用的模式

### 模式一：直接调用 Action 函数

适合 Node.js 应用，直接 import 各 action handler：

```typescript
import { handleCreateSession } from "block-agent-core/tool/actions/create-session";
import { handleSendMessage } from "block-agent-core/tool/actions/send-task";
import { handleReadEvents } from "block-agent-core/tool/actions/read-events";
import { readMessages } from "block-agent-core/core/session-store";
```

需要提供一个 `ExtensionContextLike` 对象，包含 `cwd` 和可选的 `authStorage`、`modelRegistry` 等。

### 模式二：通过 Tool 接口调用

适合在 PI Coding Agent 生态中作为扩展使用，注册一个 `block_agent_core` tool，然后通过 tool call 调用。

### 模式三：直接操作文件

适合非 Node.js 或轻量级应用：

```bash
# 读取消息
cat .block-agent-core/sessions/my-session/messages.jsonl

# 读取事件
cat .block-agent-core/sessions/my-session/events.jsonl

# 读取配置
cat .block-agent-core/sessions/my-session/system-config.json
```

---

## 完整示例

以下是一个简单的上层应用——一个脚本驱动的自动化代码审查工具：

```typescript
import { handleCreateSession } from "block-agent-core/tool/actions/create-session";
import { handleSendMessage } from "block-agent-core/tool/actions/send-task";
import { handleReadEvents } from "block-agent-core/tool/actions/read-events";
import { readMessages } from "block-agent-core/core/session-store";

async function reviewCode(sessionId: string, ctx: any) {
  // 创建会话
  await handleCreateSession({
    sessionId,
    systemPromptFilePaths: ["/path/to/review-prompt.md"],
    sdkMode: "host-inherit",
  }, ctx);

  // 发送审查请求（进入调度队列）
  const sendResp = await handleSendMessage({
    sessionId,
    inputText: "请审查当前目录的代码质量",
  }, ctx);
  const turnId = JSON.parse(sendResp.data!).send.turnId;

  // 轮询等待完成
  let events;
  do {
    await new Promise(r => setTimeout(r, 1000));
    const resp = await handleReadEvents({ sessionId, turnId }, ctx);
    events = JSON.parse(resp.data!);
  } while (!events.some((e: any) => e.type === "send_finished"));

  // 读取完整的消息记录
  const messages = await readMessages(ctx.cwd, sessionId);
  const reply = messages.find(m => m.kind === "reply");
  const tokenUsage = events.find((e: any) => e.type === "send_status");

  return {
    reply: reply?.text,
    usage: tokenUsage?.payload,
    messages,
  };
}
```

---

## 注意事项

1. **调度器是进程内状态**：`handleSendMessage` 将消息加入内存队列，进程重启后未完成的任务会丢失。计划中会引入调度器持久化来解决。
2. **文件锁是进程内互斥**：`withFileLock` 使用内存中的 mutex，多进程共享同一目录时可能产生竞争。当前推荐一个工作目录对应一个 PI 实例。
3. **消息 `id` 单调递增**：基于文件行号 + 1 生成，中间删除消息不会回收 id。这不影响功能，但审计时 id 空缺是正常现象。
4. **`tool_call` 消息的 `toolResult`**：工具执行结果直接内联在消息中，体积较大的结果（如大文件内容）会增加 `messages.jsonl` 的文件大小。
