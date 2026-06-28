# Better Subagent

PI Coding Agent 扩展 — 提供**结构化对话记忆数据库**和**受控子代理调用**能力。

## 能做什么

- **对话记忆持久化** — 每轮对话、工具调用、文件引用存成结构化记录（JSONL + Markdown）
- **上下文按需拼装** — 通过 Recipe 方案定义组装规则，加载时只注入需要的上下文，避免 prompt 膨胀
- **子代理调用** — 通过 `efficiency_subagent` 工具以 profile 控制子代理的上下文注入

## 安装

```bash
rm -rf ~/.pi/agent/extensions/better-subagent
ln -s "$(pwd)" ~/.pi/agent/extensions/better-subagent
```

安装后 PI 会自动加载以下内容：
- `skills/better-subagent/SKILL.md` — 子代理调用 skill，教 agent 如何使用 `efficiency_subagent` 工具
- `index.ts` — 注册 `dialogue_memory` 工具（load / save / query / manage）

## 项目结构

```
better-subagent/
├── index.ts              # PI 扩展入口 + 纯函数 API 导出
├── core/                 # 引擎层 — 零 PI 依赖的纯函数
│   ├── turns.ts          #   对话轮次 CRUD
│   ├── tool-calls.ts     #   工具调用记录
│   ├── templates.ts      #   模板 CRUD
│   ├── file-refs.ts      #   文件引用记录
│   ├── call-records.ts   #   调用串联记录
│   ├── recipes.ts        #   组装方案（TOML）
│   ├── build-prompt.ts   #   提示词拼装引擎
│   └── save-turn.ts      #   一键保存编排
├── utils/                # JSONL / TOML / Glob 工具
├── tool/                 # Agent 适配层 — PI 工具注册 + 动作处理
├── skills/               # PI 自动发现的 skill
└── docs/                 # 文档
```

## 开发

```bash
bun test          # 运行测试
tsc --noEmit      # 类型检查
```
