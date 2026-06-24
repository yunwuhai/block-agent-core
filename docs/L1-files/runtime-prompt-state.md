# backend/runtime/prompt-state.ts

Prompt State 模块 — 从旧的 computation/prompt/engine.ts 提取的最小模块。

## 职责

管理全局的占位符绑定和槽位持久化状态，供 RunLifecycle 使用。

## 导出的符号

| 符号 | 类型 | 描述 |
|------|------|------|
| `PromptSlotChange` | interface | 单个操作日志条目 |
| `SerializedSlots` | interface | 持久化用的序列化格式 |
| `registerPlaceholder(name, filePath)` | function | 绑定 {{name}} → 文件路径 |
| `unregisterPlaceholder(name)` | function | 移除占位符绑定 |
| `listPlaceholders()` | function | 列出所有占位符 |
| `getEventLog()` | function | 返回操作日志 |
| `serializeSlots()` | function | 序列化所有槽位和占位符 |
| `deserializeSlots(data)` | function | 反序列化恢复状态 |
| `reset()` | function | 清除所有状态 |

## 依赖

无运行时依赖。仅使用 `node:fs/promises` 和 `node:path`。
