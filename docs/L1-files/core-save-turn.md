# core/save-turn.ts

## 作用

一键保存编排 — 将对话轮次原子性写入 `.md` 文件并追加到 4 个 JSONL 表中。

依赖：`./turns.ts`、`./tool-calls.ts`、`./file-refs.ts`、`./call-records.ts`、`node:fs/promises`、`node:fs`、`node:path`。

## 导出符号

| 符号 | 行号 | 说明 |
|------|------|------|
| `renderTurnMd(turn)` | 20-51 | 将 TurnInput 渲染为 Markdown 格式字符串 |
| `sequentialId(prefix, index)` | 16-18 | 生成 `prefix-NNN` 格式的 fallback ID |
| `normalizeParams(params)` | 114-138 | 统一 flat 和 grouped 两种参数格式 |
| `saveTurn(params)` | 144-178 | 主函数 — 原子保存 |

### saveTurn 参数

支持两种格式，通过 `SaveTurnParams` 联合类型表达：
- **`SaveTurnFlatParams`**（旧）：14 个平铺字段
- **`SaveTurnGroupedParams`**（新）：`{ paths, ids, turn, toolCalls, fileRefs, callRecord }`

### saveTurn 内部流程

| 步骤 | 说明 |
|------|------|
| 1. 标准化参数 | `normalizeParams` 统一两种格式 |
| 2. 写入 .md | 先写 `.tmp` 再 `renameSync` 原子替换 |
| 3. 追加 turn 记录 | `appendTurn` → JSONL |
| 4. 追加 toolCall 记录 | 遍历 `toolCalls`，`sequentialId("call", i)` fallback |
| 5. 追加 fileRef 记录 | 遍历 `fileRefs`，`sequentialId("ref", i)` fallback |
| 6. 追加 callRecord | `appendCallRecord` → JSONL |
