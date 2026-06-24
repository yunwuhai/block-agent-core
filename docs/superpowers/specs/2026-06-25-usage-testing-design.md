# Usage Testing Design for efficiency-subagent

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create the implementation plan, then use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task.

**Goal:** Establish a reusable usage-testing methodology for the efficiency-subagent project, based on real-user simulation with agent-driven fix-review-verify cycles.

**Architecture:** Independent test projects in `~/workspace/usage-tests/<project>/<scenario>/` that import the project's `executeRun` API. Each scenario is executed by a simulated user (Claude Code subagent), with defects handled through a 3-stage fix → review → verify pipeline.

**Tech Stack:** Bun (test runtime), Claude Code subagents (test drivers), the efficiency-subagent project's `executeRun` API.

---

## 1. Motivation

### 1.1 Why Usage Testing?

Existing tests (unit + integration) verify that functions return expected values. They do NOT verify:

- Whether the project is USEFUL for real tasks
- Whether the API ergonomics make sense when composing multi-step flows
- Whether the context assembly pipeline produces coherent prompts under real conditions
- Whether the project's abstractions (Entry, Capability, Lifecycle) map naturally to real use cases

Usage testing fills this gap by simulating a real user who has a task to accomplish and uses the project to do it.

### 1.2 What This Is Not

- NOT a benchmark — we are not measuring throughput or latency
- NOT a unit test — we are not asserting individual function outputs
- NOT a replacement for existing tests — these coexist with the existing test suite

## 2. Test Infrastructure

### 2.1 Directory Layout

```
~/workspace/
├── efficiency-subagent/                   # 项目本体（主分支）
│   └── docs/superpowers/specs/
│       └── 2026-06-25-usage-testing-design.md   ← 本文件
│
└── usage-tests/                            # 🔹 测试项目根目录
    ├── README.md                           #    测试方法论文档
    │
    ├── efficiency-subagent/                # 🔹 本项目测试
    │   ├── 01-basic-flow/                  #    场景1
    │   │   ├── scenario.json               #      场景定义
    │   │   ├── setup/                      #      测试配置
    │   │   │   └── basic.worker.md         #        测试 profile
    │   │   ├── test-runner.ts              #      测试执行脚本
    │   │   └── report.md                   #      测试报告
    │   │
    │   ├── 02-context-scheduling/          #    场景2
    │   ├── 03-workflow-orch/               #    场景3
    │   ├── 04-novel-writer/                #    场景4
    │   └── 05-policy-enforcement/          #    场景5
    │
    └── <other-project>/                    # 未来其他项目
```

### 2.2 How Tests Import the Project

Test scripts import `executeRun` from the project using a relative path:

```ts
// test-runner.ts — from ~/workspace/usage-tests/efficiency-subagent/<scenario>/
import { executeRun } from "../../../efficiency-subagent/backend/entry/index.ts";
```

This avoids path dependency (tests are not inside the project) while still testing the real API.

### 2.3 Test Profiles

Each scenario defines its own `.md` profile(s) in `setup/`, following the same YAML frontmatter format as the project's own `.profiles/` directory. This simulates a user who configures the subagent for their specific task.

## 3. Testing Process

### 3.1 Phase Flow

```
Phase 1: DESIGN
  ├─ Define scenario goal and expected behavior
  ├─ Create test profiles and entry definitions
  └─ git checkout -b test/<scenario-name>

Phase 2: EXECUTE (User Subagent)
  ├─ A Claude Code subagent acts as the "user"
  ├─ Calls executeRun() to accomplish the scenario's task
  ├─ Validates output against expected behavior
  └─ Records any defects found

Phase 3: FIX-REVIEW-VERIFY CYCLE
  ┌── Fix Subagent
  │     Proposes fix for each defect
  │       ↓
  │   Review Subagent (strict gatekeeper)
  │     Can REJECT → Fix Subagent defends or updates proposal → re-review
  │     APPROVED  ↓
  │       ↓
  │   Verify Subagent
  │     Applies the fix in test branch
  │     Re-runs the test scenario
  │     Checks: defect resolved? no regression?
  │     NOT fixed / worse → back to Fix Subagent
  │     CONFIRMED FIXED → git commit ✨
  └──

Phase 4: REPORT
  ├─ Summarize: what was fixed, added, removed
  ├─ Restate: test goal and methodology
  └─ Declare: final result (PASS / PARTIAL / FAIL)

Phase 5: SUBMIT
  ├─ Push test branch to remote
  └─ Checkout back to main branch
```

### 3.2 Branch Strategy

- Each scenario runs in its own branch: `test/<scenario-name>`
- Branches are forked from `main`
- All code changes happen ONLY on the test branch
- Main branch remains untouched until changes are deliberately merged

### 3.3 Commit Discipline

- Commit after EVERY successfully verified fix
- Commit message format: `test(<scenario>): fix <defect-description>`
- This ensures each commit is a clean, verified change that can be reverted independently

## 4. Test Scenarios

### 4.1 Scenario 01: Basic Flow (基础使用流程)

**Goal:** Verify the core run lifecycle works from a user's perspective.

**What it tests:**
- `executeRun()` with a minimal profile
- Run completes with `status: "completed"`
- Handoff and transcript artifacts are created
- Run continuation preserves state
- Error handling (invalid profile, missing cwd)

**Method:**
1. Define a simple profile `basic.worker.md` with one tool (read)
2. Call `executeRun({ profile: "basic.worker", task: "list files in current directory", cwd: "./setup" })`
3. Verify: run completes, handoff exists, transcript exists
4. Call `executeRun` again with the same `runId` → verify continuation works
5. Call with invalid profile → verify graceful error

### 4.2 Scenario 02: Context Scheduling (上下文调度)

**Goal:** Verify runtime dynamic context assembly works correctly.

**What it tests:**
- Schedule entries by tags, IDs, and group
- Verify the subagent's assembled context includes the scheduled content
- Unschedule entries and verify context is updated
- Multiple schedule/un-schedule operations across a single run

**Method:**
1. Define a profile with registry entries in different groups
2. Start a run with no initial schedule
3. Use actions: `[{ type: "schedule", tags: ["database"] }]`
4. Verify the re-resolved assembly includes matching entries
5. Use actions: `[{ type: "unschedule", entryIds: ["..."] }]`
6. Verify the entry is removed from assembly

### 4.3 Scenario 03: Workflow Orchestrator (Workflow 编排器)

**Goal:** Verify the project can serve as a workflow engine — its most promising real-world use case.

**What it tests:**
- Registry entries as workflow steps with capabilities and dependencies
- Schedule/unschedule as workflow state transitions
- Step-by-step execution with context changes between steps
- Capability-based resolution (the subagent selects steps by capability)

**Method:**
1. Define 3 workflow steps as registry entries, each with distinct capabilities and a dependency chain
2. Define a workflow-orchestrator profile that understands the step pattern
3. Step 1: schedule step-1 entry → subagent reads and executes it → reports completion
4. Step 2: unschedule step-1 + schedule step-2 → context switches → subagent proceeds
5. Step 3: continue pattern → completion
6. Verify each step received only its own context, not future steps'

**Design detail — entry definitions:**
```yaml
# Step 1: Analyze requirements
entries:
  - name: step-analyze
    description: Analyze input requirements
    tags: [step]
    capabilities: [workflow/analyze]
    priority: 10
    content: |
      ## Step: Analyze
      1. Read the input requirements
      2. Identify key deliverables
      3. Report findings
    lifecycle: { type: rounds, maxRounds: 1 }

# Step 2: Design solution
  - name: step-design
    description: Design solution architecture
    tags: [step]
    capabilities: [workflow/design]
    depends: [workflow/analyze]
    priority: 10
    content: |
      ## Step: Design
      1. Based on the analysis, design a solution
      2. Consider trade-offs
      3. Document the design

# Step 3: Implement
  - name: step-implement
    description: Implement the designed solution
    tags: [step]
    capabilities: [workflow/implement]
    depends: [workflow/design]
    priority: 10
    content: |
      ## Step: Implement
      1. Implement the designed solution
      2. Write tests
      3. Verify correctness
```

**Execution flow:**
```ts
// Step 1: analyze
let result = await executeRun({
  profile: "workflow-orch",
  task: "Analyze this: build a CLI tool in TypeScript",
  cwd: "./setup",
  actions: [{ type: "schedule", capabilities: ["workflow/analyze"] }]
});
// Verify: output contains analysis

// Step 2: design
result = await executeRun({
  runId: result.id,
  actions: [
    { type: "unschedule", capabilities: ["workflow/analyze"] },
    { type: "schedule", capabilities: ["workflow/design"] }
  ]
});
// Verify: output contains design

// Step 3: implement
result = await executeRun({
  runId: result.id,
  actions: [
    { type: "unschedule", capabilities: ["workflow/design"] },
    { type: "schedule", capabilities: ["workflow/implement"] }
  ]
});
// Verify: output contains implementation
```

### 4.4 Scenario 04: Novel Writer Plugin (写小说插件)

**Goal:** Verify the project handles knowledge-intensive, creative tasks with rich context.

**What it tests:**
- Multiple registry entries with varied content (characters, world-building, style guides)
- Placeholder resolution in prompts
- Template-based content generation
- Multi-round continuation for iterative creative work

**Method:**
1. Define registry entries for: world-building, character profiles, writing style, plot outline
2. Define a profile with placeholders that reference these entries
3. Start a writing session → subagent generates a chapter
4. Continue the session → subagent generates the next chapter with same context
5. Verify the voice and details are consistent across continuations

### 4.5 Scenario 05: Policy Enforcement (策略控制)

**Goal:** Verify the policy engine protects security boundaries in real usage.

**What it tests:**
- Tool-level restrictions (allow/deny lists)
- Path-based access control (glob patterns)
- Policy violation detection and blocking
- Policy modification and re-execution

**Method:**
1. Define a profile with restricted tools and paths
2. Have the subagent attempt a forbidden action → verify it's blocked with a `policy_block` event
3. Have the subagent attempt an allowed action → verify it succeeds
4. Modify the policy to allow the previously forbidden action
5. Re-run and verify the action now succeeds

## 5. Report Format

Each scenario's `report.md` follows this template:

```markdown
# Test Report: <Scenario Name>

**Date:** 2026-06-25
**Branch:** test/<scenario-name>
**Tester:** efficiency-subagent v<version>

## Test Goal
<what this scenario is testing and why>

## Methodology
<how the test was conducted>

## Defects Found
| # | Defect | Severity | Status |
|---|--------|----------|--------|
| 1 | <description> | high/med/low | fixed | open |

## Changes Made
### Added
- <file path>: <what>

### Modified
- <file path>: <what changed>

### Removed
- <file path>: <what>

## Final Result
**PASS** / **PARTIAL** / **FAIL**

<summary of outcome>
```

## 6. Methodology Documentation

The testing methodology itself lives in `~/workspace/usage-tests/README.md`. This document covers:

- What usage testing is and why it matters
- The directory structure convention
- The agent-driven test process (design → execute → fix-review-verify → report)
- Branch strategy and commit discipline
- How to add a new scenario
- How to run existing scenarios

This ensures that every future update to the project includes usage testing as a standard step.

## 7. First Execution Plan

The first execution will:

1. Create `~/workspace/usage-tests/` with `README.md` methodology docs
2. Create Scenario 01 (basic-flow) as the simplest demonstration
3. Run it via a user subagent
4. Fix any issues found through the fix-review-verify cycle
5. Write the test report
6. Commit all changes on `test/basic-flow` branch

Future executions add more scenarios.

## 8. Success Criteria

The usage testing methodology is successful when:

- A new developer can add a test scenario by reading only `usage-tests/README.md`
- Each scenario runs independently (no cross-scenario state)
- The fix-review-verify cycle produces clean, verified commits
- Test reports provide actionable insight into project health
- The methodology is reusable for other projects in `~/workspace/usage-tests/`
