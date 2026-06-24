# 项目精简优化实施计划

> **给代理执行者的说明:** 必需的子技能: 使用 subagent-driven-development（推荐）或 executing-plans 来逐任务执行此计划。步骤使用 `- [ ]` 语法跟踪进度。

**目标:** 删除遗留系统、死代码和冗余模块，将 project 从 ~50 源文件压缩到 ~30 个，并将 `index.ts` 从旧编排器切换到新系统。

**架构:** 四阶段方法：(1) 提取最小的 prompt-state.ts，(2) 重新连接 index.ts 到新入口，(3) 删除所有未引用的旧代码和死代码，(4) 同步文档。任何存在新旧双方案的模块，保留新方案。

**技术栈:** TypeScript (ESNext, strict 模式), Bun 运行时, Zod 验证

## 全局约束

- TypeScript `verbatimModuleSyntax` — 类型导入必须使用 `import type`
- 所有 `executeRun` 调用必须通过新入口 (`backend/entry/index.ts`)
- 删除前确保无其他文件引用
- 每步完成后验证 `bun test` 和 `tsc --noEmit`
- 修改任何源文件的同时更新对应的 L1 文档

---

### 任务 1: 创建 `backend/runtime/prompt-state.ts`

**文件:**
- 创建: `backend/runtime/prompt-state.ts`
- 修改: `backend/runtime/run.ts` (第 50-56 行导入)
- 修改: `backend/entry/entry.test.ts` (第 15 行导入)
- 创建: `docs/L1-files/runtime-prompt-state.md`

**接口:**
- 消费: `engine.ts` 中 `registerPlaceholder`, `getEventLog`, `serializeSlots`, `deserializeSlots`, `reset`, `SerializedSlots`, `PromptSlotChange`
- 产出: 相同的函数签名从新位置导出

- [ ] **步骤 1: 创建 `backend/runtime/prompt-state.ts`**

从 `engine.ts` 提取被实际使用的功能，剥离所有旧 slot API。

```typescript
/**
 * Prompt State — 占位符绑定、事件日志和槽位持久化
 *
 * 从旧的 computation/prompt/engine.ts 提取的最小模块。
 * 仅包含被新系统（RunLifecycle）使用的功能。
 *
 * 功能:
 *   registerPlaceholder(name, filePath) — 将 {{name}} 绑定到 markdown 文件
 *   getEventLog()                       — 返回操作变更日志
 *   serializeSlots() / deserializeSlots() — 多轮延续的状态持久化
 *   reset()                             — 清除所有状态（主要用于测试）
 */

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// 路径解析
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLUGIN_DIR = resolve(__dirname, "..", "..");

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

interface SlotEntry {
  content: string;
  priority: number;
  consumes: number;
  ttl?: number;
  createdAt: number;
}

interface PlaceholderEntry {
  filePath: string;
}

export interface PromptSlotChange {
  readonly operation: "set" | "clear" | "push" | "pop" | "consume" | "register_placeholder" | "unregister_placeholder";
  readonly slotName: string;
  readonly content?: string;
  readonly priority?: number;
}

// ---------------------------------------------------------------------------
// 状态（模块级可变变量）
// ---------------------------------------------------------------------------

const slots = new Map<string, SlotEntry>();
const stacks = new Map<string, { entries: SlotEntry[] }>();
const placeholders = new Map<string, PlaceholderEntry>();
const eventLog: PromptSlotChange[] = [];

// ---------------------------------------------------------------------------
// 占位符 API
// ---------------------------------------------------------------------------

/**
 * 注册占位符绑定: 在 run.ts 中调用，将 {{name}} 映射到文件路径。
 * {{name}} 会在 compose 时被替换为文件内容。
 */
export function registerPlaceholder(name: string, filePath: string): void {
  const resolvedPath = resolve(PLUGIN_DIR, filePath);
  placeholders.set(name, { filePath: resolvedPath });
  eventLog.push({ operation: "register_placeholder", slotName: name, content: resolvedPath });
}

/**
 * 获取操作事件日志。被 run.ts 用于记录槽位变化。
 */
export function getEventLog(): readonly PromptSlotChange[] {
  return eventLog;
}

/**
 * 清除所有状态（用于测试和重置）。
 */
export function reset(): void {
  slots.clear();
  stacks.clear();
  placeholders.clear();
  eventLog.length = 0;
}

// ---------------------------------------------------------------------------
// 槽位持久化 — 多轮延续的序列化/反序列化
// ---------------------------------------------------------------------------

export interface SerializedSlots {
  readonly slots: Readonly<Record<string, SlotEntry>>;
  readonly stacks: Readonly<Record<string, readonly SlotEntry[]>>;
  readonly placeholders: Readonly<Record<string, string>>;
}

export function serializeSlots(): SerializedSlots {
  const slotObj: Record<string, SlotEntry> = {};
  for (const [name, entry] of slots) {
    slotObj[name] = entry;
  }
  const stackObj: Record<string, readonly SlotEntry[]> = {};
  for (const [name, stack] of stacks) {
    stackObj[name] = stack.entries;
  }
  const placeholderObj: Record<string, string> = {};
  for (const [name, entry] of placeholders) {
    placeholderObj[name] = entry.filePath;
  }
  return { slots: slotObj, stacks: stackObj, placeholders: placeholderObj };
}

export function deserializeSlots(data: SerializedSlots): void {
  slots.clear();
  stacks.clear();
  placeholders.clear();
  for (const [name, entry] of Object.entries(data.slots)) {
    slots.set(name, entry);
  }
  for (const [name, entries] of Object.entries(data.stacks)) {
    stacks.set(name, { entries: [...entries] });
  }
  if (data.placeholders) {
    for (const [name, filePath] of Object.entries(data.placeholders)) {
      placeholders.set(name, { filePath });
    }
  }
}
```

- [ ] **步骤 2: 更新 `backend/runtime/run.ts` 的导入**

将第 51-56 行从导入 `computation/prompt/engine.ts` 改为导入新的 `prompt-state.ts`:

```typescript
// 替换:
import {
  deserializeSlots,
  registerPlaceholder,
  getEventLog,
} from "../computation/prompt/engine.ts";
import type { SerializedSlots } from "../computation/prompt/engine.ts";

// 改为:
import {
  deserializeSlots,
  registerPlaceholder,
  getEventLog,
} from "./prompt-state.ts";
import type { SerializedSlots } from "./prompt-state.ts";
```

- [ ] **步骤 3: 更新 `backend/entry/entry.test.ts` 的导入**

将第 15 行从导入 `computation/prompt/engine.ts` 改为导入 `runtime/prompt-state.ts`:

```typescript
// 替换:
import { reset } from "../computation/prompt/engine.ts";

// 改为:
import { reset } from "../runtime/prompt-state.ts";
```

- [ ] **步骤 4: 创建文档 `docs/L1-files/runtime-prompt-state.md`**

```markdown
# backend/runtime/prompt-state.ts

Prompt State 模块 — 从旧的 computation/prompt/engine.ts 提取的最小模块。

## 职责

管理全局的占位符绑定和槽位持久化状态:

## 导出的符号

| 符号 | 类型 | 行号 | 描述 |
|------|------|------|------|
| `PromptSlotChange` | interface | — | 单个操作日志条目 |
| `SerializedSlots` | interface | — | 持久化用的序列化格式 |
| `registerPlaceholder(name, filePath)` | function | — | 绑定 {{name}} → 文件路径 |
| `getEventLog()` | function | — | 返回操作日志 |
| `serializeSlots()` | function | — | 序列化所有槽位和占位符 |
| `deserializeSlots(data)` | function | — | 反序列化恢复状态 |
| `reset()` | function | — | 清除所有状态 |

## 依赖

无运行时依赖。仅使用 `node:fs/promises` 和 `node:path`。
```

- [ ] **步骤 5: 验证**

运行: `bun test` — 预期 162 个测试全部通过（无功能变化，仅导入路径改变）
运行: `tsc --noEmit` — 预期零类型错误

- [ ] **步骤 6: 提交**

```bash
git add backend/runtime/prompt-state.ts backend/runtime/run.ts backend/entry/entry.test.ts docs/L1-files/runtime-prompt-state.md
git commit -m "refactor: extract prompt-state.ts from legacy prompt engine"
```

---

### 任务 2: 将 `index.ts` 重新连接到新入口

**文件:**
- 修改: `index.ts` — 将导入和 `executeRun` 调用改为用 `backend/entry/index.ts` 的新系统
- 删除: `backend/runtime/mod.ts` — 旧 barrel（仅被 index.ts 使用以导出旧编排器）
- 删除: `backend/runtime/orchestrator.ts` — 旧编排器（不再被任何文件引用）
- 删除: `docs/L1-files/runtime-mod.md`
- 删除: `docs/L1-files/runtime-orchestrator.md`

**接口映射:**

| 旧调用参数 | 新调用参数 |
|---|---|
| `cwd` | `cwd`（相同） |
| `params.profile` | `profile`（展开） |
| `params.task` | `task`（展开） |
| `params.runId` | `runId`（展开） |
| `params.actions` | 需要将旧 `ActionParams[]` 转换为新 `Action[]` |
| `signal` | 新系统不支持信号中止（可后续增强） |

**旧 ActionParams 到新 Action 的映射:**
```
旧 { toolName: "read", filePath: "..." }
→ 新 { type: "tool_call", tool: "read", args: { filePath: "..." } }

旧 { toolName: "scheduleEntries", scheduleTags: ["..."] }
→ 新 { type: "schedule", tags: ["..."] }

旧 { toolName: "unscheduleEntries", unscheduleIds: ["..."] }
→ 新 { type: "unschedule", entryIds: ["..."] }
```

**旧 RunResult 到新 RunResult 映射:**
```
旧 .runId  →  新 .id
旧 .status →  新 .status（相同）
旧 .handoffPath → 新 .handoffPath（相同）
旧 .transcriptPath → 新 .transcriptPath（相同）
旧 .output → 新 .output（相同）
```

- [ ] **步骤 1: 修改 `index.ts`**

替换导入和调用：

```typescript
// 替换第 17-19 行:
// import { ToolParamsSchema, type ToolParams } from "./backend/input/mod.ts";
// import { reset as resetSlots } from "./backend/computation/prompt/engine.ts";
// import { executeRun } from "./backend/runtime/mod.ts";

// 改为:
import { ToolParamsSchema, type ToolParams } from "./backend/input/mod.ts";
import { reset } from "./backend/runtime/prompt-state.ts";
import { executeRun } from "./backend/entry/index.ts";
```

修改头部注释（第 1-14 行），移除对旧系统的引用：

```typescript
/**
 * Efficiency Subagent - Lightweight controllable subagent plugin for PI Coding Agent.
 *
 * Profile-based subagent invocation with durable session recording,
 * structured handoff, dynamic prompt registry control, permission enforcement,
 * and transcript generation.
 *
 * Architecture:
 *   backend/entry/       — public API facade, dependency wiring
 *   backend/runtime/     — run lifecycle (RunLifecycle), MountController
 *   backend/core/        — pure algorithm layer (Registry, Pipeline, Composer)
 *   backend/input/       — profile and config loading
 *   backend/storage/     — runtime artifact persistence
 *   backend/computation/policy/ — permission evaluation
 */
```

修改 `renderCall` 函数中的 `resetSlots` 引用：

```typescript
// 替换第 74 行:
// resetSlots();
reset(); // 现在来自 prompt-state.ts
```

修改 `execute` 函数中的 `executeRun` 调用（第 95-99 行）：

```typescript
const result = await executeRun({
  profile: params.profile,
  task: params.task,
  cwd,
  runId: params.runId,
  actions: params.actions ? convertActions(params.actions) : undefined,
});
```

在 `execute` 函数前添加转换函数：

```typescript
/**
 * 将旧的 ActionParams[] 格式转换为新的 Action[] 格式。
 */
function convertActions(actions: NonNullable<ToolParams["actions"]>): Array<import("./backend/runtime/run.ts").Action> {
  return actions.map((a) => {
    if (a.toolName === "scheduleEntries") {
      return {
        type: "schedule" as const,
        ...(a.scheduleTags?.length ? { tags: a.scheduleTags } : {}),
        ...(a.scheduleIds?.length ? { ids: a.scheduleIds } : {}),
        ...(a.scheduleGroup ? { group: a.scheduleGroup } : {}),
      };
    }
    if (a.toolName === "unscheduleEntries") {
      return {
        type: "unschedule" as const,
        entryIds: a.unscheduleIds ?? [],
      };
    }
    // 默认为 tool_call
    return {
      type: "tool_call" as const,
      tool: a.toolName,
      args: {
        ...(a.filePath ? { filePath: a.filePath } : {}),
        ...(a.command ? { command: a.command } : {}),
        ...(a.url ? { url: a.url } : {}),
        ...(a.envVar ? { envVar: a.envVar } : {}),
      },
    };
  });
}
```

修改结果处理中的字段名称（第 102-122 行），将 `result.runId` 改为 `result.id`：

```typescript
const summary = [
  `Efficiency Subagent: ${result.status.toUpperCase()}`,
  `Run ID: ${result.id}`,              // 改前: result.runId
  `Handoff: ${result.handoffPath}`,
  ...(result.transcriptPath !== undefined ? [`Transcript: ${result.transcriptPath}`] : []),
].join("\n");

const exitCode = result.status === "completed" ? 0 : result.status === "blocked" ? 2 : 1;

return {
  content: [{ type: "text", text: summary }],
  details: {
    mode: "single",
    results: [{
      agent: params.profile,
      task: params.task,
      exitCode,
      output: result.output,
      runId: result.id,                // 改前: result.runId
      status: result.status,
      handoffPath: result.handoffPath,
      ...(result.transcriptPath !== undefined ? { transcriptPath: result.transcriptPath } : {}),
    }],
  },
};
```

移除不再需要的 `ToolParams` 导入（因为现在直接展开 `params.profile`/`params.task` 等，但如果其他地方还用就保留）。实际上 `ToolParamsSchema` 仍然用于参数验证（第 76 行），所以保留它。

- [ ] **步骤 2: 删除 `backend/runtime/mod.ts`**

```bash
rm backend/runtime/mod.ts
```

旧 barrel 内容仅用于重导出旧编排器的 `executeRun`，已不再需要。

注意: `RegistryStore` 和 `createProjectPaths` 之前也由 mod.ts 导出，但 `entry/index.ts` 直接导入自 `registry-store.ts`，不受影响。

- [ ] **步骤 3: 删除 `backend/runtime/orchestrator.ts`**

```bash
rm backend/runtime/orchestrator.ts
```

验证无其他文件通过路径引用它：
```bash
grep -rn "orchestrator" backend/ --include="*.ts" | grep -v "\.test\." | grep -v node_modules
# 预期：仅匹配 actions.ts 中的 MountController 注释提及旧编排器（不导入）
```

- [ ] **步骤 4: 删除 L1 文档**

```bash
rm docs/L1-files/runtime-mod.md docs/L1-files/runtime-orchestrator.md
```

- [ ] **步骤 5: 验证**

运行: `bun test` — 预期所有测试通过（删除的旧测试将在后续任务中处理）
运行: `tsc --noEmit` — 预期零类型错误

- [ ] **步骤 6: 提交**

```bash
git add index.ts docs/L1-files/runtime-prompt-state.md
git rm backend/runtime/mod.ts backend/runtime/orchestrator.ts docs/L1-files/runtime-mod.md docs/L1-files/runtime-orchestrator.md
git commit -m "refactor: rewire index.ts to use new entry/executeRun"
```

---

### 任务 3: 删除旧注册表系统 (computation/registry)

**文件:**
- 删除: `backend/computation/registry/` 整个目录（mod.ts, types.ts, storage.ts, resolution.ts, orchestration.ts, composer.ts, registry.test.ts）
- 删除: `docs/L1-files/registry-mod.md`
- 删除: `docs/L1-files/registry-types.md`
- 删除: `docs/L1-files/registry-storage.md`
- 删除: `docs/L1-files/registry-resolution.md`
- 删除: `docs/L1-files/registry-orchestration.md`
- 删除: `docs/L1-files/registry-composer.md`
- 删除: `docs/L1-files/tests-registry-test.md`

**原因:** 仅在旧编排器 (orchestrator.ts) 中被使用，该文件已在任务 2 中删除。

- [ ] **步骤 1: 验证无其他文件引用 registry**

```bash
grep -rn "computation/registry" backend/ --include="*.ts" | grep -v "\.test\." | grep -v node_modules
# 预期：无输出
```

- [ ] **步骤 2: 删除目录和文档**

```bash
rm -rf backend/computation/registry
rm docs/L1-files/registry-mod.md docs/L1-files/registry-types.md docs/L1-files/registry-storage.md docs/L1-files/registry-resolution.md docs/L1-files/registry-orchestration.md docs/L1-files/registry-composer.md docs/L1-files/tests-registry-test.md
```

- [ ] **步骤 3: 更新 L2 和 L3 文档（标记这些模块已删除）**

更新 `docs/L2-modules/_index-registry.md` — 标记所有对应文件为已删除。
更新 `docs/L3-architecture/backend-computation.md` — 移除旧 registry 的描述。

- [ ] **步骤 4: 验证**

运行: `bun test` — 预期成功
运行: `tsc --noEmit` — 预期零类型错误

- [ ] **步骤 5: 提交**

```bash
git add -A docs/
git rm -r backend/computation/registry
git commit -m "refactor: remove legacy registry module (computation/registry)"
```

---

### 任务 4: 删除旧 prompt engine (computation/prompt)

**文件:**
- 删除: `backend/computation/prompt/engine.ts`
- 删除: `backend/computation/prompt/prompt-slots.test.ts`
- 删除: `docs/L1-files/runtime-prompt-slots-engine.md`
- 删除: `docs/L1-files/tests-prompt-slots-test.md`

**原因:** 所有活跃的功能已在任务 1 中提取到 `prompt-state.ts`。旧引擎不再被任何文件引用。

- [ ] **步骤 1: 验证无其他文件引用**

```bash
grep -rn "computation/prompt" backend/ --include="*.ts" | grep -v node_modules
# 预期：仅 index.test.ts 可能还有引用（检查）
grep -rn "computation/prompt" . --include="*.ts" | grep -v node_modules
# 如果还有引用，更新它们
```

如果 `index.test.ts` 引用了 prompt engine，更新它。

- [ ] **步骤 2: 删除文件和文档**

```bash
rm backend/computation/prompt/engine.ts backend/computation/prompt/prompt-slots.test.ts
rm docs/L1-files/runtime-prompt-slots-engine.md docs/L1-files/tests-prompt-slots-test.md
rmdir backend/computation/prompt  # 如果空目录
```

- [ ] **步骤 3: 删除 barrel `backend/computation/prompt/mod.ts`（如果存在）**

```bash
# 如果 prompt 目录为空，删除它
```

- [ ] **步骤 4: 验证**

运行: `bun test` — 预期成功
运行: `tsc --noEmit` — 预期零类型错误

- [ ] **步骤 5: 提交**

```bash
git rm backend/computation/prompt/engine.ts backend/computation/prompt/prompt-slots.test.ts
git rm docs/L1-files/runtime-prompt-slots-engine.md docs/L1-files/tests-prompt-slots-test.md
git commit -m "refactor: remove legacy prompt engine (replaced by prompt-state.ts)"
```

---

### 任务 5: 删除死代码文件

**文件:**
- 删除: `backend/computation/policy/merge.ts` — 无处引用
- 删除: `backend/computation/policy/helpers.ts` — 无处引用
- 删除: `backend/output/handoff-store.ts` — 无处引用
- 删除: `backend/output/transcript-projector.ts` — 无处引用
- 删除: `backend/input/params.ts` — 被 barrel 引用但无实际使用者
- 删除: `backend/input/project-loader.ts` — 被 barrel 引用但无实际使用者
- 删除: `docs/L1-files/config-params.md`
- 删除: `docs/L1-files/config-project-loader.md`
- 删除: `docs/L1-files/policy-merge.md`
- 删除: `docs/L1-files/storage-handoff-store.md`
- 删除: `docs/L1-files/storage-transcript-projector.md`
- 修改: `backend/input/mod.ts` — 移除对 `params.ts` 和 `project-loader.ts` 的重导出

- [ ] **步骤 1: 验证死代码确实是死代码**

```bash
# 验证这些文件无处被导入（测试文件也检查）
grep -rn "from.*policy/merge\|from.*policy/helpers" . --include="*.ts" | grep -v node_modules
grep -rn "from.*output/handoff-store\|from.*output/transcript-projector" . --include="*.ts" | grep -v node_modules
grep -rn "from.*input/params\|from.*input/project-loader" . --include="*.ts" | grep -v node_modules | grep -v "input/mod"
# input/mod.ts 导出它们，所以忽略它。检查是否有其他文件直接导入它们。
grep -rn "from.*input/params\b\|from.*input/project-loader\b" . --include="*.ts" | grep -v node_modules | grep -v "input/mod.ts"
```

- [ ] **步骤 2: 更新 `backend/input/mod.ts`**

```typescript
// 移除第 12 行和第 14 行:
export { validateToolParams } from "./params.ts";
export { loadProjectPolicy } from "./project-loader.ts";

// 修改后:
export {
  ActionSchema,
  type ActionParams,
  ToolParamsSchema,
  type ToolParams,
  ProfileFrontmatterSchema,
  type ProfileFrontmatter,
  type ProfileDefinition,
  ProjectPolicySchema,
  type ProjectPolicy,
} from "./schema.ts";
export { loadProfile } from "./profile-loader.ts";
```

- [ ] **步骤 3: 删除文件和文档**

```bash
rm backend/computation/policy/merge.ts backend/computation/policy/helpers.ts
rm backend/output/handoff-store.ts backend/output/transcript-projector.ts
rm backend/input/params.ts backend/input/project-loader.ts
rm docs/L1-files/config-params.md docs/L1-files/config-project-loader.md docs/L1-files/policy-merge.md docs/L1-files/storage-handoff-store.md docs/L1-files/storage-transcript-projector.md
```

- [ ] **步骤 4: 如果 `backend/output/` 为空，删除目录**

```bash
ls backend/output/
# 预期为空，删除
rmdir backend/output/ 2>/dev/null || true
```

- [ ] **步骤 5: 验证**

运行: `bun test` — 预期所有测试通过
运行: `tsc --noEmit` — 预期零类型错误

- [ ] **步骤 6: 提交**

```bash
git rm backend/computation/policy/merge.ts backend/computation/policy/helpers.ts
git rm backend/output/handoff-store.ts backend/output/transcript-projector.ts
git rm backend/input/params.ts backend/input/project-loader.ts
git rm docs/L1-files/config-params.md docs/L1-files/config-project-loader.md docs/L1-files/policy-merge.md docs/L1-files/storage-handoff-store.md docs/L1-files/storage-transcript-projector.md
git add backend/input/mod.ts
git commit -m "refactor: remove dead code files"
```

---

### 任务 6: 删除旧测试文件

**文件:**
- 删除: `backend/runtime/runtime.test.ts` — 测试旧编排器
- 删除: `backend/runtime/live-context.test.ts` — 测试旧动态调度
- 删除: `docs/L1-files/tests-runtime-test.md`
- 删除: `docs/L1-files/tests-live-context-test.md`

**原因:** 这些测试覆盖已在任务 2 中删除的旧编排器功能。

- [ ] **步骤 1: 验证旧测试失效**

这些测试通过 `import { reset } from "../computation/prompt/engine.ts"` 引用旧 prompt engine，而该文件即将被删除。它们也引用 `executeRun` 来自 `runtime/mod.ts`（已删除）。它们必然失效。

- [ ] **步骤 2: 删除文件和文档**

```bash
rm backend/runtime/runtime.test.ts backend/runtime/live-context.test.ts
rm docs/L1-files/tests-runtime-test.md docs/L1-files/tests-live-context-test.md
```

- [ ] **步骤 3: 验证剩余测试**

运行: `bun test` — 预期测试数减少但仍然全部通过
运行: `tsc --noEmit` — 预期零类型错误

- [ ] **步骤 4: 提交**

```bash
git rm backend/runtime/runtime.test.ts backend/runtime/live-context.test.ts
git rm docs/L1-files/tests-runtime-test.md docs/L1-files/tests-live-context-test.md
git commit -m "test: remove tests for legacy orchestrator"
```

---

### 任务 7: 更新 L2/L3 模块文档

**文件:**
- 修改: `docs/L2-modules/_index.md`
- 修改: `docs/L2-modules/_index-registry.md`
- 修改: `docs/L2-modules/_index-runtime.md`
- 修改: `docs/L2-modules/_index-other.md`
- 修改: `docs/L2-modules/runtime-core.md`
- 修改: `docs/L2-modules/registry-engine.md`
- 修改: `docs/L2-modules/registry-storage.md`
- 修改: `docs/L2-modules/registry-types.md`
- 修改: `docs/L2-modules/prompt-engine.md`
- 修改: `docs/L2-modules/root-entry.md`
- 修改: `docs/L3-architecture/backend-computation.md`
- 修改: `docs/L3-architecture/backend-output.md`
- 修改: `docs/L3-architecture/runtime.md`

**方法:** 不需要逐行重写每个文档，只需：
1. 标记已删除的模块为"已移除"
2. 更新模块依赖图以及映新结构
3. 更新数据流描述

- [ ] **步骤 1: 更新 L2 索引文档**

将已删除模块的条目标记为已移除，更新模块计数。

```markdown
<!-- 在 _index.md 中 -->
- ~后端模块计数更新~
```

- [ ] **步骤 2: 更新 L3 架构文档**

移除对旧 registry、旧 prompt engine、旧编排器的引用。

- [ ] **步骤 3: 验证**

运行: `bun test` — 预期通过
运行: `tsc --noEmit` — 预期通过

- [ ] **步骤 4: 提交**

```bash
git add docs/
git commit -m "docs: sync module docs after legacy code removal"
```

---

### 任务 8: 最终清理 & 验证

- [ ] **步骤 1: 检查 `backend/computation/` 目录结构**

```bash
# 计算模块应仅包含 policy/ 子目录
ls backend/computation/
# 预期: policy/  (registry/ 和 prompt/ 已删除)
```

- [ ] **步骤 2: 运行完整测试套件**

```bash
bun test 2>&1
# 预期: 所有测试通过
```

- [ ] **步骤 3: 运行类型检查**

```bash
tsc --noEmit 2>&1
# 预期: 零错误
```

- [ ] **步骤 4: 检查是否有被忽略的引用**

```bash
# 检查是否还有文件引用已删除的路径
grep -rn "computation/registry\|computation/prompt\|runtime/mod\|runtime/orchestrator" . --include="*.ts" --include="*.md" | grep -v node_modules | grep -v ".git/"
# 预期: 仅文档中可能会提到历史引用（可接受），不应有导入语句
```

- [ ] **步骤 5: 最终提交**

```bash
git add -A
git commit -m "chore: final cleanup after project compaction"
```

---

## 恢复 / 回滚指南

如果某一步出现问题：

1. **任务 1 失败（prompt-state.ts）:** `git checkout -- backend/runtime/run.ts backend/entry/entry.test.ts` 恢复原始导入，删除新文件。
2. **任务 2 失败（index.ts 重新连接）:** `git checkout -- index.ts` 恢复原始入口调用，恢复 `runtime/mod.ts` 和 `orchestrator.ts`。
3. **后续任务（删除旧代码）:** 从 git 恢复已删除文件：`git checkout <commit-hash> -- <file-path>`。

每个任务都是独立可逆的。建议按顺序执行。
