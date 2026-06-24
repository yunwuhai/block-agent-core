# Usage Testing Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the usage testing infrastructure (directory structure, methodology doc, Mock PI utility) and the first test scenario (01-basic-flow) for the efficiency-subagent project.

**Architecture:** The test infrastructure lives in `~/workspace/usage-tests/`, independent from the project. All tests go through a Mock PI ExtensionAPI that simulates the PI Coding Agent environment. The first scenario (01-basic-flow) tests the core lifecycle through `tool.execute()`.

**Tech Stack:** Bun (test runtime), TypeScript, Mock PI ExtensionAPI. The project is a PI Coding Agent extension — all testing goes through `pi.registerTool()` → `tool.execute()`.

## Global Constraints

- Project is a pure PI Coding Agent extension (not a standalone library)
- All testing goes through Mock PI → `tool.execute()`, never bypassing to `executeRun` directly
- The `import type` from `@earendil-works/pi-coding-agent` is elided at runtime — no package needed
- Profile loader expects profiles at `cwd/.profiles/<name>.md`
- Policy loader expects config at `cwd/.pi/better-subagent/config.json`
- Profile frontmatter uses `tools:` list field for tool allowlist
- Each test scenario runs on its own `test/<scenario>` branch
- `tsconfig` has `exactOptionalPropertyTypes: true` and `verbatimModuleSyntax: true`
- Modifications to `.ts` source files must sync `docs/L1-files/` documentation

---

### Task 1: Create usage-tests directory structure and methodology documentation

**Files:**
- Create: `~/workspace/usage-tests/README.md`
- Create: `~/workspace/usage-tests/efficiency-subagent/lib/` (directory)
- Create: `~/workspace/usage-tests/efficiency-subagent/01-basic-flow/` (directory)
- Create: `~/workspace/usage-tests/efficiency-subagent/02-context-scheduling/` (directory)
- Create: `~/workspace/usage-tests/efficiency-subagent/03-workflow-orch/` (directory)
- Create: `~/workspace/usage-tests/efficiency-subagent/04-novel-writer/` (directory)
- Create: `~/workspace/usage-tests/efficiency-subagent/05-policy-enforcement/` (directory)

**Interfaces:**
- Consumes: Design spec at `docs/superpowers/specs/2026-06-25-usage-testing-design.md`
- Produces: `~/workspace/usage-tests/README.md` — the methodology doc that all future scenarios reference

This task creates the physical directory tree and the central methodology document. Every scenario and every future contributor reads `README.md` first.

- [ ] **Step 1: Create directory tree**

```bash
mkdir -p ~/workspace/usage-tests/efficiency-subagent/{lib,01-basic-flow,02-context-scheduling,03-workflow-orch,04-novel-writer,05-policy-enforcement}
```

Expected: directories created (verify with `ls -la ~/workspace/usage-tests/efficiency-subagent/`).

- [ ] **Step 2: Write `~/workspace/usage-tests/README.md`**

```markdown
# Usage Tests

针对 PI Coding Agent extension 项目的使用测试（Usage Testing）基础设施。

## 什么是使用测试？

使用测试模拟真实用户通过 PI Coding Agent 调用扩展工具的完整流程，验证：

- 工具的 `description` 是否能让 LLM 正确理解用法
- 工具的参数设计是否直观
- 多步调用流程是否顺畅
- 错误信息是否对 LLM 可理解

## 目录结构

```
usage-tests/
├── README.md                       # 本文件 — 测试方法论文档
└── <project-name>/                 # 被测试的项目
    ├── lib/                        # 共享测试工具
    │   └── mock-pi.ts              #   Mock PI ExtensionAPI
    ├── 01-<scenario>/              # 测试场景（带编号）
    │   ├── scenario.json           #   场景定义
    │   ├── .profiles/              #   测试用的 profile 文件
    │   │   └── <name>.md
    │   ├── .pi/
    │   │   └── better-subagent/
    │   │       └── config.json     #   项目策略配置
    │   ├── test-runner.ts          #   测试执行脚本
    │   └── report.md              #   测试报告（执行后生成）
    ├── 02-<scenario>/
    └── ...
```

## 测试流程

每个场景遵循以下流程：

1. **设计** — 定义场景目标、profile、配置
2. **执行** — Claude Code subagent 通过 Mock PI 调用 tool.execute() 完成测试
3. **修复-审核-验证循环** — 发现缺陷 → 修复 subagent 提方案 → 审核 subagent 评审 → 验证 subagent 确认修复
4. **报告** — 编写 test report，包含 description 有效性评估
5. **提交** — 在 test/<场景> 分支上提交变更

## 分支策略

- 每个场景使用独立分支：`test/<场景名>`
- 从 main 分叉，所有修改只在测试分支上进行
- 每次验证通过的修复后立即提交
- 提交格式：`test(<场景>): fix <缺陷描述>`

## 如何添加新场景

1. 从 `01-basic-flow/` 复制目录结构
2. 编写 `scenario.json` 定义场景
3. 创建 `.profiles/<name>.md` 测试 profile
4. 配置 `.pi/better-subagent/config.json` 策略
5. 编写 `test-runner.ts` 使用 mock-pi.ts 执行测试
6. 在 `test/<场景名>` 分支上运行测试

## Mock PI 使用方法

```ts
// 从场景目录（如 01-basic-flow/）导入：
import { createMockPI } from "../lib/mock-pi.ts";
import ext from "../../../efficiency-subagent/index.ts";

const { pi, callTool, getTool } = createMockPI();
ext(pi);

const result = await callTool("efficiency_subagent", {
  profile: "worker",
  task: "do something",
}, { cwd: "/path/to/scenario" });
```

## description 有效性评估

每次测试报告中应包含对 tool description 的评估：

- **触发准确性：** LLM 是否能在正确场景下决定调用此工具？
- **参数理解：** LLM 是否能理解各参数含义？
- **返回值理解：** LLM 是否能解析返回结果？
- **错误处理：** LLM 是否能理解错误原因并采取下一步？
```

- [ ] **Step 3: Verify structure**

```bash
ls -R ~/workspace/usage-tests/
```

Expected: All directories exist, `README.md` is present and non-empty.

---

### Task 2: Implement Mock PI utility (lib/mock-pi.ts)

**Files:**
- Create: `~/workspace/usage-tests/efficiency-subagent/lib/mock-pi.ts`

**Interfaces:**
- Consumes: Knowledge that `index.ts` default export takes `ExtensionAPI` and calls `registerTool()`
- Produces: `createMockPI()` — returns `{ pi, callTool, getTool }` used by all test-runners

This is the single shared utility that all test scenarios use. It replaces the real PI Coding Agent environment.

- [ ] **Step 1: Write `lib/mock-pi.ts`**

```typescript
/**
 * Mock PI Coding Agent ExtensionAPI for usage testing.
 *
 * Simulates the PI environment so tests can:
 *   1. Load the extension via its default export
 *   2. Capture tool registration
 *   3. Call tool.execute() with arbitrary params
 *   4. Inspect the returned ToolResponse
 *
 * No actual PI dependency needed — ExtensionAPI types are import type (elided at runtime).
 */

// We define minimal local types to avoid needing @earendil-works/pi-coding-agent at runtime.
// These match the shapes used by index.ts.

interface MockToolDefinition {
  name: string;
  label?: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (
    toolCallId: string,
    params: unknown,
    signal?: AbortSignal,
    onUpdate?: unknown,
    ctx?: { cwd?: string },
  ) => Promise<{
    content: Array<{ type: string; text: string }>;
    details?: Record<string, unknown>;
    terminate?: boolean;
  }>;
  renderCall?: (params: unknown) => { render(width: number): string[]; invalidate(): void };
  renderResult?: (result: unknown) => { render(width: number): string[]; invalidate(): void };
}

export interface MockPIEnv {
  /** The fake ExtensionAPI object to pass to the extension's default export. */
  pi: {
    registerTool(def: MockToolDefinition): void;
  };
  /** Registered tools, keyed by name. */
  tools: Map<string, MockToolDefinition>;
  /** Call a registered tool's execute() with the given params and context. */
  callTool(
    name: string,
    params: unknown,
    ctx?: { cwd?: string },
  ): Promise<{
    content: Array<{ type: string; text: string }>;
    details?: Record<string, unknown>;
    terminate?: boolean;
  }>;
  /** Get a tool definition by name — useful for inspecting description/parameters. */
  getTool(name: string): MockToolDefinition | undefined;
}

/**
 * Create a complete Mock PI environment.
 *
 * Usage:
 *   const env = createMockPI();
 *   const ext = (await import("../../path/to/index.ts")).default;
 *   ext(env.pi);
 *   const result = await env.callTool("efficiency_subagent", { profile: "...", task: "..." });
 */
export function createMockPI(): MockPIEnv {
  const tools = new Map<string, MockToolDefinition>();

  const pi = {
    registerTool(def: MockToolDefinition): void {
      if (tools.has(def.name)) {
        throw new Error(`Mock PI: tool "${def.name}" already registered`);
      }
      tools.set(def.name, def);
    },
  };

  async function callTool(
    name: string,
    params: unknown,
    ctx?: { cwd?: string },
  ): Promise<{
    content: Array<{ type: string; text: string }>;
    details?: Record<string, unknown>;
    terminate?: boolean;
  }> {
    const tool = tools.get(name);
    if (!tool) {
      throw new Error(`Mock PI: tool "${name}" not registered`);
    }
    return tool.execute("mock-call-id", params, undefined, undefined, ctx);
  }

  function getTool(name: string): MockToolDefinition | undefined {
    return tools.get(name);
  }

  return { pi, tools, callTool, getTool };
}
```

- [ ] **Step 2: Verify mock-pi.ts loads correctly with Bun**

```bash
cd ~/workspace/usage-tests/efficiency-subagent
bun run -e "import { createMockPI } from './lib/mock-pi.ts'; const env = createMockPI(); console.log('Mock PI created, tools:', env.tools.size);"
```

Expected: `Mock PI created, tools: 0` — no errors, module loads cleanly.

---

### Task 3: Create Scenario 01 profiles and configuration

**Files:**
- Create: `~/workspace/usage-tests/efficiency-subagent/01-basic-flow/.profiles/basic-worker.md`
- Create: `~/workspace/usage-tests/efficiency-subagent/01-basic-flow/.pi/better-subagent/config.json`
- Create: `~/workspace/usage-tests/efficiency-subagent/01-basic-flow/scenario.json`

**Interfaces:**
- Consumes: Mock PI from Task 2, efficiency-subagent's `loadProfile` and `loadProjectPolicy` conventions
- Produces: The test assets that `test-runner.ts` (Task 4) uses to exercise the extension

The profile and config must match what `executeRun` internally expects. The profile path is `cwd/.profiles/` and the policy path is `cwd/.pi/better-subagent/`.

- [ ] **Step 1: Create `.profiles/basic-worker.md`**

```markdown
---
name: basic-worker
description: Minimal worker profile for basic flow testing
tools:
  - read
---
# Basic Worker

Your task: ${task}

You are a minimal worker subagent used for testing the core run lifecycle.
Report what you find.
```

- [ ] **Step 2: Create `.pi/better-subagent/config.json`**

This matches the policy format expected by `backend/computation/policy/loader.ts`:

```json
{
  "allowTools": ["read"],
  "allowPaths": ["*"]
}
```

- [ ] **Step 3: Create `scenario.json`**

```json
{
  "name": "01-basic-flow",
  "title": "基础使用流程",
  "goal": "从 PI agent 的角度验证最核心的调用流程——工具注册、参数验证、运行执行、续跑、错误处理",
  "testLayer": "PI 适配层（通过 Mock PI 模拟）",
  "checkpoints": [
    "扩展加载后工具被正确注册（name === 'efficiency_subagent'）",
    "description 非空且包含足够信息",
    "最小参数调用返回 content + details 格式正确",
    "返回结果包含 run ID、状态、handoff 路径",
    "用同一 profile 再次调用能成功续跑",
    "无效参数返回 terminate: true 和清晰的错误信息"
  ],
  "successCriteria": "六个检查点全部通过，或每个未通过的检查点都有明确的缺陷记录"
}
```

- [ ] **Step 4: Verify profile loads correctly**

```bash
cd ~/workspace/usage-tests/efficiency-subagent/01-basic-flow
cat .profiles/basic-worker.md
cat .pi/better-subagent/config.json
cat scenario.json
```

Expected: All three files exist and contain valid content.

---

### Task 4: Write Scenario 01 test-runner

**Files:**
- Create: `~/workspace/usage-tests/efficiency-subagent/01-basic-flow/test-runner.ts`

**Interfaces:**
- Consumes: `createMockPI()` from `../../lib/mock-pi.ts`, the extension's default export at `../../../efficiency-subagent/index.ts`
- Produces: A Bun-executable script that exercises the basic flow and prints results to stdout

The test-runner imports the extension through the Mock PI, calls the tool with various parameter combinations, and prints structured output for the subagent to evaluate.

- [ ] **Step 1: Write `test-runner.ts`**

```typescript
/**
 * Scenario 01: Basic Flow — test-runner
 *
 * Exercises the efficiency_subagent tool through Mock PI to verify:
 *   1. Tool registration
 *   2. Minimal parameter call → successful run
 *   3. Description content
 *   4. Continuation (re-run with same profile)
 *   5. Invalid parameter handling
 *
 * Run from this directory:
 *   bun run test-runner.ts
 *
 * The output is evaluated by a human/subagent to assess correctness.
 */

import { createMockPI } from "../lib/mock-pi.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function separator(title: string): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(60)}`);
}

function check(label: string, pass: boolean, detail?: string): void {
  const icon = pass ? "✓" : "✗";
  console.log(`  ${icon} ${label}`);
  if (detail) console.log(`       ${detail}`);
  if (!pass) console.log(`       ⚠  DEFECT RECORDED`);
}

function defect(id: string, description: string, severity: "high" | "med" | "low"): void {
  console.log(`       [DEFECT ${id}] (${severity}) ${description}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const scenarioRoot = process.cwd();
  console.log(`Scenario 01: Basic Flow — test-runner`);
  console.log(`CWD: ${scenarioRoot}`);
  console.log(`Date: ${new Date().toISOString().slice(0, 10)}`);

  // ---- Step 1: Load extension via Mock PI ----
  separator("1. Tool Registration");

  const env = createMockPI();

  try {
    const ext = (await import("../../../efficiency-subagent/index.ts")).default;
    ext(env.pi);
    console.log("  Extension loaded successfully.");
  } catch (err) {
    console.log("  ✗ FAILED to load extension:", err);
    process.exit(1);
  }

  const tool = env.getTool("efficiency_subagent");
  check("Tool registered with name 'efficiency_subagent'", tool !== undefined);
  if (!tool) {
    console.log("\n  ✗ Cannot continue without tool — aborting.");
    process.exit(1);
  }

  check("Tool has non-empty description", tool.description.length > 50, `length=${tool.description.length}`);
  check("Tool has parameters defined", typeof tool.parameters === "object" && tool.parameters !== null);
  check(
    "Parameters include 'profile' and 'task' as required fields",
    typeof tool.parameters === "object" &&
      tool.parameters !== null &&
      "properties" in tool.parameters &&
      typeof (tool.parameters as Record<string, unknown>).properties === "object" &&
      "profile" in (tool.parameters as Record<string, unknown>).properties as Record<string, unknown> &&
      "task" in (tool.parameters as Record<string, unknown>).properties as Record<string, unknown>,
  );
  if (tool.description) {
    console.log(`\n  Description preview:\n    ${tool.description.slice(0, 120)}...`);
  }

  // ---- Step 2: Minimal parameter call ----
  separator("2. Minimal Parameter Call");

  let result: Awaited<ReturnType<typeof env.callTool>>;
  try {
    result = await env.callTool("efficiency_subagent", {
      profile: "basic-worker",
      task: "list files in current directory",
    }, { cwd: scenarioRoot });
    console.log("  execute() returned without throwing.");
  } catch (err) {
    console.log("  ✗ execute() threw:", err);
    process.exit(1);
  }

  check("Response has content array", Array.isArray(result.content));
  check("Response has details object", typeof result.details === "object");
  if (result.content?.[0]?.text) {
    const text = result.content[0].text;
    check("Content text includes status", /COMPLETED|FAILED|BLOCKED/i.test(text), text.slice(0, 80));
    check("Content text includes Run ID", text.includes("Run ID:"), text.slice(0, 80));
    check("Content text includes Handoff path", text.includes("Handoff:"), text.slice(0, 80));
  }
  if (result.details && typeof result.details === "object") {
    const d = result.details as Record<string, unknown>;
    check("details.mode === 'single'", d.mode === "single");
    const results = d.results as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(results) && results.length > 0) {
      const r = results[0]!;
      check("results[0] has agent", typeof r.agent === "string");
      check("results[0] has task", typeof r.task === "string");
      check("results[0] has exitCode", typeof r.exitCode === "number");
      check("results[0] has output", typeof r.output === "string");
      check("results[0] has runId", typeof r.runId === "string");
      check("results[0] has status", typeof r.status === "string");
      check("results[0] has handoffPath", typeof r.handoffPath === "string");
    }
  }

  // Extract runId for continuation test
  const details = result.details as Record<string, unknown> | undefined;
  const resultsArr = details?.results as Array<Record<string, unknown>> | undefined;
  const firstRunId = resultsArr?.[0]?.runId as string | undefined;

  // ---- Step 3: Continuation (re-run with same profile) ----
  separator("3. Run Continuation");

  if (firstRunId) {
    console.log(`  Continuing run: ${firstRunId}`);
    try {
      const continueResult = await env.callTool("efficiency_subagent", {
        profile: "basic-worker",
        task: "continue verifying state",
        runId: firstRunId,
      }, { cwd: scenarioRoot });

      check("Continuation returned successfully", true);
      const contDetails = continueResult.details as Record<string, unknown> | undefined;
      const contResults = contDetails?.results as Array<Record<string, unknown>> | undefined;
      const contRunId = contResults?.[0]?.runId as string | undefined;
      check("Continuation preserves runId", contRunId === firstRunId, `expected ${firstRunId}, got ${contRunId}`);
    } catch (err) {
      check("Continuation execute() threw", false);
      defect("BF-001", `Continuation failed with error: ${err}`, "high");
    }
  } else {
    defect("BF-002", "No runId from first call — cannot test continuation", "high");
  }

  // ---- Step 4: Invalid parameter handling ----
  separator("4. Invalid Parameter Handling");

  try {
    // Missing required 'task' param
    const badResult = await env.callTool("efficiency_subagent", {
      profile: "basic-worker",
      // no task
    } as unknown as Record<string, unknown>, { cwd: scenarioRoot });

    const hadError = badResult.terminate === true;
    check("Invalid params returns terminate: true", hadError);
    if (badResult.content?.[0]?.text) {
      check("Error message is descriptive", badResult.content[0].text.length > 10,
        badResult.content[0].text.slice(0, 100));
    }
  } catch (err) {
    // Throwing is also acceptable for invalid params
    check("Invalid params threw an error (acceptable)", true, String(err));
  }

  // ---- Step 5: Description quality assessment ----
  separator("5. Description Quality Assessment");

  if (tool.description) {
    const desc = tool.description;
    console.log(`  Full description (${desc.length} chars):\n`);
    console.log(`    ${desc.replace(/\n/g, "\n    ")}`);
    console.log();

    // Check that key concepts are mentioned
    const keywords = [
      { word: "profile", reason: "核心参数" },
      { word: "task", reason: "核心参数" },
      { word: "runId", reason: "续跑功能" },
      { word: "action", reason: "动作序列" },
      { word: "policy", reason: "策略控制" },
      { word: "session", reason: "会话持久化" },
    ];

    for (const { word, reason } of keywords) {
      check(`Description mentions '${word}' (${reason})`, desc.toLowerCase().includes(word));
    }
  }

  // ---- Summary ----
  separator("Summary");
  console.log("  Test execution complete. Review output for defects.");
  console.log("  Check the checkpoints list in scenario.json against results.");
  console.log("  Write findings to report.md.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify test-runner compiles and runs**

```bash
cd ~/workspace/usage-tests/efficiency-subagent/01-basic-flow
bun run test-runner.ts 2>&1
```

Expected: The script runs to completion, printing all checks. Some checks may fail (that's OK — those are defects to be recorded). The important thing is that it doesn't crash with a compilation error.

- [ ] **Step 3: If the test-runner crashes, diagnose and fix**

If there's a TypeScript or import error, fix it before proceeding. Common issues:
- Path to `efficiency-subagent/index.ts` is wrong (adjust `../../../` based on actual location)
- `exactOptionalPropertyTypes` violations in index.ts when passing params

---

### Task 5: Execute Scenario 01 via workflow and process results

**Files:**
- Create: `~/workspace/usage-tests/efficiency-subagent/01-basic-flow/report.md` (generated during execution)

**Interfaces:**
- Consumes: Tasks 1-4 (infrastructure + test-runner), efficiency-subagent project source
- Produces: Test report with defect list, changes made, and description quality assessment

This task is a **Workflow** — it uses multiple subagents to execute the test, process defects, and produce the report. It runs on a `test/basic-flow` branch.

- [ ] **Step 1: Create test branch**

```bash
cd ~/workspace/efficiency-subagent
git checkout -b test/basic-flow
```

- [ ] **Step 2: Run the test-runner via a user subagent**

Dispatch a Claude Code subagent to:
1. Run `bun run ~/workspace/usage-tests/efficiency-subagent/01-basic-flow/test-runner.ts`
2. Read the output
3. Compare against `scenario.json` checkpoints
4. Identify any defects
5. Record the defects

- [ ] **Step 3: For each defect found, run fix-review-verify cycle**

For each defect (or batch of related defects):

1. **Fix Subagent**: Propose a fix for the defect. This modifies files in the efficiency-subagent project (e.g., `index.ts`, `run.ts`, `backend/entry/index.ts`).
2. **Review Subagent**: Review the fix proposal. Can reject if:
   - Fix breaks existing tests (`bun test` must still pass)
   - Fix introduces type errors (`tsc --noEmit` must pass)
   - Fix is unnecessary or wrong
3. **Verify Subagent**: Apply the fix, re-run the test-runner, verify the defect is resolved and no regressions introduced.
4. **Commit**: `git commit -m "test(basic-flow): fix <description>"`

- [ ] **Step 4: Write test report `report.md`**

After all defects are processed, write the final report:

```markdown
# 测试报告：基础使用流程

**日期：** 2026-06-25
**分支：** test/basic-flow
**测试层次：** PI 适配层（Mock PI）
**测试版本：** efficiency-subagent v0.1

## 测试目标
从 PI agent 的角度验证最核心的调用流程：工具注册、参数验证、运行执行、续跑、错误处理。

## 测试方案
通过 Mock PI ExtensionAPI 加载扩展，调用 tool.execute() 模拟 PI 环境下的真实调用场景。

## 发现的缺陷
| # | 缺陷 | 严重程度 | 状态 |
|---|------|----------|------|
| 1 | <...> | 高/中/低 | 已修复 / 待处理 |

## description 有效性评估
<LLM 通过 description 是否能正确理解工具用法？>

## 变更记录
### 新增
- <文件路径>：<说明>

### 修改
- <文件路径>：<变更内容>

### 删除
- <文件路径>：<说明>

## 最终结果
**通过** / **部分通过** / **未通过**

<结果总结>
```

- [ ] **Step 5: Commit the report and any remaining changes**

```bash
cd ~/workspace/efficiency-subagent
git add -A
git commit -m "test(basic-flow): add test report and final fixes"
```

- [ ] **Step 6: Switch back to main branch**

```bash
git checkout main
```
