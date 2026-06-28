# tool/actions/load.ts

## 作用

处理 `dialogue_memory` 工具 `action: "load"` — 从调用记录中提取 zone refs，解析引用内容，拼装提示词。

依赖：`../../core/build-prompt.ts`, `../../utils/jsonl.ts`。

## 导出符号

| 符号 | 行号 | 说明 |
|------|------|------|
| `defaultResolver(ref)` | 13-35 | 默认 Ref 解析器 — 支持 full（读取文件内容）和 handoff（仅摘要）模式，支持按行范围截取 |
| `handleLoad(params, ctx)` | 37-66 | 主 handler — 查 callRecord → 解析 refs → 拼装提示词 |

### `handleLoad` 内部流程

| 步骤 | 行号 | 说明 |
|------|------|------|
| 查找调用记录 | 41-48 | 按 `recipeId` 或取最后一条 |
| 解析 ref 内容 | 50-57 | 遍历所有 zone 的 refs，去重解析 |
| 拼装提示词 | 59-64 | 用解析后的内容和 resolver 调用 `buildPrompt` |
