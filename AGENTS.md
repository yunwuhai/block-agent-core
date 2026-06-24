# AGENTS.md — efficiency-subagent

The project internally uses the name **better-subagent** and follows an assembly metaphor: context is assembled from a Registry of reusable Entry objects by a Pipeline, then rendered by a Composer.

## 核心规则

### 读：先查文档，不读源码
**所有源码信息已提取到 `docs/` 三层文档中。** 需要了解任何文件、模块、架构时，先查文档，不要直接读 `.ts` 源码。

### 写：编辑代码 → 同步文档
**每次修改 `.ts` 源码后，必须同步更新对应的 `docs/L1-files/` 文档。** 新增/删除/重命名导出符号、修改函数签名、调整行号范围，都要反映到文档中。文档不准比代码旧。

| 层级 | 位置 | 内容 |
|------|------|------|
| L1 文件级 | `docs/L1-files/` | 每个文件的作用、每个导出符号的简介+行号 |
| L2 模块级 | `docs/L2-modules/` | 功能模块的耦合分析、数据流图、依赖关系 |
| L3 架构级 | `docs/L3-architecture/` | 前端(操作) vs 后端(输入+输出+存储+计算)分类 |
| 用户手册 | `docs/user-manual.md` | 给 LLM 看的项目使用指南 |
| 冗余审计 | `docs/audit-redundancy.md` | 已发现并处理的冗余项 |

## 开发命令

```bash
bun test          # 运行全部测试（当前 132 pass / 0 fail），测试与源文件同目录
tsc --noEmit      # 类型检查
```

## 架构速览

- `backend/core/` — Pure algorithm layer (NO I/O — architectural invariant). Types, Registry, Pipeline, Composer, Capability.
- `backend/runtime/` — I/O layer. RegistryStore, RunLifecycle, MountController, output formatters.
- `backend/entry/` — Wiring and public API (executeRun).
- `backend/storage/` — Event logging and run directory management.
- `backend/input/` — Profile/config loading and Zod schemas.
- `backend/computation/policy/` — Minimal permission evaluation.
- `backend/computation/registry/` — LEGACY registry (being migrated to core/ + runtime/).
- `backend/computation/prompt/` — LEGACY prompt engine (being migrated to core/composer).

## 关键约束

- `tsconfig` 有 `exactOptionalPropertyTypes: true`、`verbatimModuleSyntax: true` — 不能用 `import X` 导入 type，必须 `import type`
- 禁止 `as any`、`@ts-ignore`、`@ts-expect-error`
- 测试文件与源文件同目录（如 `backend/computation/registry/registry.test.ts`）
- PI 扩展通过 symlink 部署：`ln -s $(pwd) ~/.pi/agent/extensions/efficiency-subagent`
- **Core purity**: `backend/core/` modules must never import `fs`, `path`, or perform I/O. The only permitted external import is `node:crypto` for content-addressed entry ID generation. This is an architectural invariant enforced by code review.

## 不要做的事

- ❌ 直接读 `.ts` 源码 — 查 `docs/L1-files/` 即可
- ❌ 改代码不更新文档 — 每次编辑 `.ts` 必须同步 `docs/L1-files/` 对应文档
- ❌ 读 `registry.jsonl` / `registry-calls.jsonl` — 运行时数据，已 gitignore
- ❌ 修改 `tsconfig.json` 的 strict 选项
- ❌ 在测试文件中跳过测试（.skip / .todo）

## /optimize 流程

项目已跑过一次完整的 `/optimize`（6步文档化+冗余清理+目录重组）。重新执行 `/optimize` 时，skill 会自动检测阶段：
- `.omo/feature-code-index.md` 存在 → 从 Phase 2（问卷分析）开始
- 不要手动跳过阶段检测逻辑
