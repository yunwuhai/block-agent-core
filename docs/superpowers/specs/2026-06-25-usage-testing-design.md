# Usage Testing 设计方案 — efficiency-subagent

> **给执行者的说明：** 请使用 writing-plans skill 创建实施计划，然后使用 subagent-driven-development 或 executing-plans skill 逐任务执行。

**目标：** 为 efficiency-subagent 项目建立一套可复用的使用测试方法论，通过模拟真实 PI Coding Agent 环境 + agent 驱动的修复-审核-验证循环来发现和修复问题。

**项目定位：** PI Coding Agent extension。核心接口是通过 `pi.registerTool()` 注册的 `efficiency_subagent` 工具。

**架构：** 独立测试项目放在 `~/workspace/usage-tests/<项目>/<场景>/` 下。所有测试通过 Mock PI ExtensionAPI 进行。

**技术栈：** Bun、Claude Code subagent、Mock PI ExtensionAPI。

---

## 1. 动机

现有单元测试只验证函数级行为，无法验证：
- 工具 `description` 是否能让 LLM 正确理解用法
- 多步调用整体流程是否顺畅
- 策略拒绝时的错误信息对 LLM 是否可理解
- 这个扩展在实际使用中是否真正解决问题

使用测试通过模拟 PI 环境填补这个空白。

## 2. 测试基础设施

```
~/workspace/usage-tests/
├── README.md                         # 方法论文档
└── efficiency-subagent/
    ├── lib/mock-pi.ts                # Mock PI ExtensionAPI
    ├── 01-basic-flow/                # 场景1：基础流程 ✅
    ├── 02-context-scheduling/        # 场景2：上下文调度
    ├── 03-workflow-orch/             # 场景3：Workflow 编排
    ├── 04-novel-writer/              # 场景4：写小说
    └── 05-policy-enforcement/        # 场景5：策略控制
```

## 3. 测试流程

```
阶段 1: 设计 → 场景定义 + profile + 配置
阶段 2: 执行 → Claude Code subagent 通过 Mock PI 调 tool.execute()
阶段 3: 修复-审核-验证 → 修复提方案 → 审核评审 → 验证确认修复 → git commit
阶段 4: 报告 → 写入 report.md
阶段 5: 提交 → push 测试分支
```

分支策略：每个场景 `test/<场景名>`，从 main 分叉，修改只在测试分支上。

## 4. 测试场景

### 场景 01：基础使用流程 ✅（已完成，27/27 通过）

### 场景 02：上下文调度
验证运行时动态上下文组装：schedule/unschedule entries、assembly 变化、多次操作。

### 场景 03：Workflow 编排器
Registry entries 作为 workflow steps，schedule/unschedule 作为状态转换。

### 场景 04：写小说插件
知识密集型任务：多 entry、placeholder、多轮续写。

### 场景 05：策略控制
工具限制、路径控制、policy_block 事件、策略修改重试。

## 5. 报告格式

每个场景的 report.md 包含：测试目标、方案、缺陷列表、description 评估、变更记录、最终结果。

## 6. 成功标准

- Mock PI 环境模拟完整调用链路
- 修复-审核-验证循环产生干净提交
- 报告包含 description 有效性评估
- 方法论文档可指导新场景设计
