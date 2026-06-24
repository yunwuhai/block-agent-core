# 项目精简优化设计

**日期:** 2025-06-25  
**状态:** 已批准实施  
**目标:** 通过删除遗留系统、死代码和冗余模块，使 efficiency-subagent 项目更加紧凑和架构纯粹。

---

## 动机

项目在从旧架构向新架构迁移过程中，积累了两套并行的运行时系统。这种双重系统状态违背了"紧凑和纯粹"的原则——它增加了维护负担、让新读者困惑，并产生了从未被执行过的死代码。

**核心原则:** 对于任何同时存在新旧实现的模块，保留新的/更好的设计，删除旧的。

---

## 阶段 1 — 提取 Prompt State

**问题:** `backend/runtime/run.ts`（新系统）仍然从旧的 `backend/computation/prompt/engine.ts` 导入了 3 个函数，这阻止了删除旧提示引擎。

**措施:** 创建一个新的最小文件 `backend/runtime/prompt-state.ts`，仅提取 `run.ts` 需要的函数：

| 函数 | 用途 |
|---|---|
| `registerPlaceholder(name, filePath)` | 将 `{{name}}` 映射到文件路径，用于模板解析 |
| `getEventLog()` | 返回操作日志，用于 run 输出 |
| `serializeSlots()` / `deserializeSlots()` | 持久化/恢复状态，用于 run 延续 |
| `reset()` | 测试间清理模块状态 |

保留模块级可变状态（与原始模式相同）。省略所有旧的 slot API（`setSlot`、`pushSlot`、`popSlot`、`renderPrompt` 等）。

**涉及文件:**
- 新建: `backend/runtime/prompt-state.ts`
- 修改: `backend/runtime/run.ts` — 将导入改为新模块
- 修改: `backend/entry/entry.test.ts` — 将 `reset` 的导入改为新模块

---

## 阶段 2 — 重新连接 PI 扩展入口点

**问题:** `index.ts`（PI 扩展入口）通过 `backend/runtime/mod.ts` → `orchestrator.ts` 使用旧的编排器。

**措施:** 将 `index.ts` 改为从 `backend/entry/index.ts`（新的 `executeRun`）导入。

**当前链:**
```
index.ts → runtime/mod.ts → orchestrator.ts (旧)
```

**新链:**
```
index.ts → entry/index.ts → run.ts + core/* (新)
```

**连接后删除:**
- `backend/runtime/mod.ts`（不再被引用）
- `backend/runtime/orchestrator.ts`（不再被使用）

**兼容性检查:**
- `index.ts` 当前调用 `executeRun({ cwd, params, ...signal })`（旧接口）
- 新 `executeRun` 接受 `{ profile, task, cwd, runId?, actions?, schedule? }` — 需要确保 `params` 正确映射

**涉及文件:**
- 修改: `index.ts`
- 删除: `backend/runtime/mod.ts`
- 删除: `backend/runtime/orchestrator.ts`

---

## 阶段 3 — 删除遗留系统和死代码

### 遗留系统（仅被旧编排器使用，阶段 2 后将完全无引用）：

| 路径 | 原因 |
|---|---|
| `backend/computation/registry/types.ts` | 旧注册表类型定义 |
| `backend/computation/registry/storage.ts` | 旧注册表 JSONL 存储 |
| `backend/computation/registry/resolution.ts` | 旧解析流水线 |
| `backend/computation/registry/orchestration.ts` | 旧 ScheduleOrchestrator |
| `backend/computation/registry/composer.ts` | 旧提示组合器 |
| `backend/computation/registry/mod.ts` | 旧 barrel |
| | |
| `backend/computation/prompt/engine.ts` | 已被新的 `prompt-state.ts` 替代 |

### 死代码（无处被导入）：

| 路径 | 原因 |
|---|---|
| `backend/computation/policy/merge.ts` | 死代码 — 从未被导入 |
| `backend/computation/policy/helpers.ts` | 死代码 — 从未被导入 |
| `backend/output/handoff-store.ts` | 死代码 — handoff 由 `runtime/output.ts` 处理 |
| `backend/output/transcript-projector.ts` | 死代码 — transcript 由 `runtime/output.ts` 处理 |
| `backend/input/params.ts` | 死代码 — 验证内联在 `index.ts` 中 |
| `backend/input/project-loader.ts` | 死代码 — 策略加载通过 `computation/policy/loader.ts` 处理 |

### 旧测试（测试的是正在删除的旧系统）：

| 路径 | 原因 |
|---|---|
| `backend/computation/registry/registry.test.ts` | 测试旧注册表 |
| `backend/computation/prompt/prompt-slots.test.ts` | 测试旧提示引擎 |
| `backend/runtime/runtime.test.ts` | 测试旧编排器 |
| `backend/runtime/live-context.test.ts` | 测试旧动态调度 |

### 旧文档：

删除已删除文件对应的 L1 文档。

---

## 阶段 4 — 文档同步

- 删除 `docs/L1-files/` 中对应已删除文件的文档
- 更新 `docs/L2-modules/` 模块耦合分析
- 更新 `docs/L3-architecture/` 架构文档
- 更新 `index.ts` 头部注释以反映新架构
- 清理 `docs/audit-redundancy.md`

---

## 验证

1. `bun test` — 所有剩余测试必须通过（目标：所有未删除的测试全部通过）
2. `tsc --noEmit` — 零类型错误
3. 人工审查 diff，确保不会意外删除仍有引用的代码

---

## 变更汇总

| 类别 | 数量 |
|---|---|
| 新建文件 | 1（`prompt-state.ts`） |
| 修改文件 | 3（`index.ts`、`run.ts`、`entry.test.ts`） |
| 删除源文件 | ~15 个 |
| 删除测试文件 | 4 个 |
| 删除文档文件 | ~10 个 |

总计：从 ~50 个源文件压缩到 ~30 个源文件。
