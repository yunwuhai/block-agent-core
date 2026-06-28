# AGENTS.md — better-subagent

The project is a **Dialogue Memory Database** — a CRUD library for conversation turns, tool calls, templates, file references, call records, and recipes, backed by JSONL persistence with a permission sandbox. Named exports provide a zero-PI-dependency core API; the default export is a PI extension factory.

## 核心规则

### 读：先查文档
需要了解项目结构、模块作用时，先查 `docs/user-manual.md`。源码在 `core/`、`tool/`、`utils/` 下，函数名和 JSDoc 清晰，可直接阅读。

### 写：编辑代码 → 同步文档
每次修改公共 API（新增/删除/重命名导出符号、修改函数签名）后，同步更新 `docs/user-manual.md` 中对应的 API 表格或架构描述。

| 层级 | 位置 | 内容 |
|------|------|------|
| 用户手册 | `docs/user-manual.md` | 给 LLM 看的项目使用指南 |
| L1 文件级 | `docs/L1-files/` | 每个文件的作用、每个导出符号的简介+行号 |

## 开发命令

```bash
bun test          # 运行全部测试
tsc --noEmit      # 类型检查
```

## 架构速览

- `core/` — Pure function layer (zero PI dependency, zero I/O). Turn CRUD, tool-call records, templates, file references, call records, recipes (TOML), prompt building, save-turn orchestration, and shared types.
- `tool/` — PI integration layer. Dialogue memory tool registration + permission sandbox (`permissions.ts`) + action handlers (`actions/`).
- `utils/` — Shared helpers: JSONL file I/O (read, append, update, delete with atomic writes), glob pattern matching, TOML I/O.
- `index.ts` — Dual export: default (PI extension factory) + named (core CRUD API).
- `skills/` — PI auto-discovered skill definitions.
- `.profiles/` — User-authored profiles (YAML frontmatter + markdown body).

## 关键约束

- `tsconfig` 有 `exactOptionalPropertyTypes: true`、`verbatimModuleSyntax: true` — 不能用 `import X` 导入 type，必须 `import type`
- 禁止 `as any`、`@ts-ignore`、`@ts-expect-error`
- 测试文件与源文件同目录（如 `core/turns.test.ts`）
- PI 扩展通过 symlink 部署：`ln -s $(pwd) ~/.pi/agent/extensions/better-subagent`
- **Core purity**: `core/` modules must never import `fs`, `path`, or perform I/O. I/O is delegated to `utils/`.

## 不要做的事

- ❌ 改公共 API 不更新 `docs/user-manual.md`
- ❌ 在测试文件中跳过测试（.skip / .todo）
- ❌ 修改 `tsconfig.json` 的 strict 选项
