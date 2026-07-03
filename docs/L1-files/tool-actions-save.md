# tool/actions/save.ts

## 作用

处理 `dialogue_memory` 工具 `action: "save"` — 保存当前对话轮次。

依赖：`../../core/save-turn.ts`。

## 导出符号

| 符号 | 行号 | 说明 |
|------|------|------|
| `handleSave(params, ctx)` | 8-34 | 主 handler — UI 确认 -> 调用 `saveTurn` -> 返回摘要 |

### 参数格式

`params` 使用 `SaveTurnGroupedParams`（`paths`/`ids`/`turn`/`toolCalls`/`fileRefs`/`callRecord` 分组）。
旧版平铺格式（14 字段）通过 `saveTurn` 内部的 `normalizeParams` 自动兼容。

### 内部流程

| 步骤 | 行号 | 说明 |
|------|------|------|
| UI 确认 | 12-19 | `hasUI` 时弹窗确认文件路径列表 |
| 执行保存 | 22-30 | 调用 `saveTurn` -> 返回摘要（turnId + toolCalls 数 + fileRefs 数 + callRecordId） |
| 错误处理 | 31-33 | catch -> 返回错误消息 |
