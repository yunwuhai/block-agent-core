# tool/actions/load.ts

## 作用

处理 `dialogue_memory` 工具 `action: "load"` — 从调用记录中提取 zone refs，解析引用内容，合并模板权限，拼装提示词。

依赖：`../../core/build-prompt.ts`, `../../utils/jsonl.ts`, `../permissions.ts`。

## 导出符号

| 符号 | 行号 | 说明 |
|------|------|------|
| `defaultResolver(ref)` | 15-37 | 默认 Ref 解析器 — 支持 full（读取文件内容）和 handoff（仅摘要）模式，支持按行范围截取 |
| `handleLoad(params, ctx)` | 39-115 | 主 handler — 查 callRecord → 解析 refs → 合并模板权限 → 拼装提示词 |

### `handleLoad` 内部流程

| 步骤 | 行号 | 说明 |
|------|------|------|
| 查找调用记录 | 43-49 | 按 `recipeId` 或取最后一条 |
| 解析 ref 内容 | 52-59 | 遍历所有 zone 的 refs，去重解析 |
| 提取模板 refs | 63-68 | 从所有 zone 中筛选 `file` 含 "template" 的 ref |
| 合并权限 | 69-107 | 从模板记录中提取 `allowReadPaths`/`allowWritePaths`/`denyPaths`，合并去重后调用 `setPermissions()`。加载无模板时调用 `clearPermissions()`。UI 模式下载确认对话框，用户取消则清除权限并退出 |
| 拼装提示词 | 110-114 | 用解析后的内容和 resolver 调用 `buildPrompt` |
