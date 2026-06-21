# L3 Architecture: Boundary Violation Analysis (_bugs.md)

CRITICAL: Modules whose codebase spans the Frontend/Backend boundary — a single L2 module file that does both user-facing work AND data processing/persistence.

> **Definition of boundary violation:** An L2 module where the source files perform operations in BOTH a Frontend quadrant (显示/操作) AND a Backend quadrant (输入/输出/存储/计算), violating the layer separation principle. The classification is based on module PURPOSE, not source file location.

---

## Violation #1: `runtime-core` — The Cross-Cutting Orchestrator

**Status: RESOLVED** | **Severity: HIGH** | **Module:** [runtime-core](../L2-modules/runtime-core.md) | **Primary:** 操作 | **Spans:** 计算, 输出, 存储

### The Violation

`runtime-core` WAS the single largest module in the system (~965 lines in `runner.ts`) and crossed ALL architectural boundaries. It has been split (Step 4a) into:

- `runtime/runner.ts` (8 lines) — thin delegation wrapper preserving the public API
- `runtime/orchestrator.ts` (600 lines) — pure orchestration: lifecycle sequencing, wiring, action-loop dispatch
- `runtime/tool-simulator.ts` (287 lines) — tool execution: simulateToolInteraction, executeWithRetry, runPhaseHook

The original `runner.ts` performed:

| Phase | Operation | Architectural Quadrant | Frontend/Backend |
|-------|-----------|----------------------|-----------------|
| Run directory creation | `createRunDir()` → writes `session.json` | 存储 (Storage) | **Backend** |
| Slot deserialization | Reads `slots.json` from disk | 存储 (Storage) | **Backend** |
| Profile loading | Calls `loadProfile()` from profile-management | 输入 (Input) | **Backend** |
| Policy merge | Calls `mergePolicies()` from policy-engine | 计算 (Computation) | **Backend** |
| Hook execution | Calls `runPhaseHook()` → `runHookScripts()` | 计算 (Computation) | **Backend** |
| Prompt building | Calls `renderPromptWithRegistry()` | 计算 (Computation) | **Backend** |
| **Action loop** | `executeWithRetry()` → `simulateToolInteraction()` | **操作 (Operation)** | **Frontend** |
| Tool simulation | Policy evaluate → before_tool hook → tool call → after_tool hook | 操作 | **Frontend** |
| Policy evaluation (per-action) | Calls `evaluate()` from policy-engine | 计算 (Computation) | **Backend** |
| TUI event formatting | Calls `formatRunStart()`, `formatToolCall()`, etc. | 显示 (Display) | **Frontend** |
| Transcript build | Calls `buildTranscript()` from run-artifact-generation | 输出 (Output) | **Backend** |
| Handoff generation | Calls `writeHandoff()` from run-artifact-generation | 输出 (Output) | **Backend** |
| Slot serialization | Writes `slots.json` to disk | 存储 (Storage) | **Backend** |

**Result:** 13 lifecycle phases in a single file, spanning Frontend (操作 + 显示) and all four Backend quadrants.

### Files That Cause It

| File | Lines | Violation |
|------|-------|-----------|
| `runtime/runner.ts` | ~965 | Performs storage, computation, output, display, AND operation in one file |
| `runtime/mod.ts` | 4 | Pure barrel — no violation |

### Root Cause

`runtime-core` was designed as an **orchestrator** — the central integration hub that wires all subsystems together. This is a legitimate architectural pattern (the "Mediator" or "Orchestrator" pattern), but when implemented as a single monolithic file, it becomes a boundary violation. The orchestrator role inherently requires knowledge of all subsystems, but the implementation violates the Single Responsibility Principle by embedding the wiring logic, the action loop, AND subsystem-specific operations (storage writes, event formatting, handoff generation) in one file.

### Impact

1. **Testability:** Testing `executeRun()` requires mocking every subsystem. A unit test of the action loop must also set up storage, profiles, policy, hooks, and display.
2. **Change coupling:** A change to `RunDirectory` naming affects the orchestrator. A change to TUI formatting affects the orchestrator. Every subsystem change propagates to this single file.
3. **Directory reorganization (Step 4):** When separating `frontend/` and `backend/` directories, the `runner.ts` file cannot be placed cleanly in either — it belongs to both.
4. **Code review:** At ~965 lines, the file is 3.8x the 250 LOC ceiling. Understanding any flow requires tracing through all 17 phases.

### What Was Done (Step 4a)

The split was executed successfully. All 155 tests pass (0 fail).

### Original Recommended Split (for reference)

#### A) `runtime-orchestrator` → Frontend 操作

**New file:** `frontend/runtime-orchestrator.ts` (~300 lines)

**Responsibilities (pure orchestration — no subsystem implementation):**
- Action loop dispatching (`executeWithRetry()` → delegates to tool-simulator)
- Lifecycle phase sequencing (calling into backend services in order)
- Timeout and signal management
- Continuation logic (run ID resolution, profile drift check)
- Wiring setup (registry init, slot restore, prompt build — via delegation)

**What it does NOT do:**
- Does NOT write to storage directly (delegates to storage layer)
- Does NOT format TUI events (delegates to display layer)
- Does NOT call `writeHandoff()` or `buildTranscript()` (delegates to output layer)
- Does NOT call `evaluate()` directly (delegates to tool-simulator)

#### B) `tool-simulator` → Frontend 操作 or Backend 计算

**New file:** `runtime/tool-simulator.ts` (~200 lines) or `backend/tool-simulator.ts`

**Responsibilities (tool execution lifecycle):**
- `simulateToolInteraction()` — single-tool lifecycle
- Policy evaluation per action
- Hook dispatch per action (`before_tool` / `after_tool`)
- Tool call execution and result capture
- `executeWithRetry()` — retry logic with exponential backoff

**Rationale:** This is the core of the action loop and could be classified as either 操作 (tool dispatch) or 计算 (execution pipeline). If placed in Frontend, it's 操作; if placed in Backend, it's 计算. Recommendation: keep in Frontend as it's the "tool interaction" logic.

#### C) `run-lifecycle-handlers` → Backend (分散到各层)

**Dispersed into existing backend layers (no new module):**

| Current code in runner.ts | Move to |
|---------------------------|---------|
| `toPolicyEntry()` | `policy-engine` (already its type domain) |
| `extractFilesTouched()`, `mapToolToOperation()`, `extractFilePath()` | `run-artifact-generation` (already the handoff domain) |
| `extractToolSummary()`, `extractBlockContext()` | `run-artifact-generation` |
| Handoff generation orchestration | `run-artifact-generation` (new public `generateRunArtifacts()` function) |
| Transcript build orchestration | `run-artifact-generation` |
| Session metadata persistence | `durable-run-storage` |
| Slot serialization orchestration | `prompt-engine` (new `persistSlots(runDir)` method) |

#### Expected Result After Split

| Layer | Module | New LOC | Classification |
|-------|--------|---------|---------------|
| Frontend 操作 | `runtime-orchestrator` | ~300 | 操作 — pure orchestration |
| Frontend 操作 | `tool-simulator` | ~200 | 操作 — tool dispatch |
| Backend 计算 | `policy-engine` (extended) | +20 | 计算 — policy normalization |
| Backend 输出 | `run-artifact-generation` (extended) | +60 | 输出 — orchestrated artifact gen |
| Backend 存储 | `durable-run-storage` (extended) | +30 | 存储 — session persistence |
| Backend 计算 | `prompt-engine` (extended) | +20 | 计算 — slot persistence |

**Net effect:** `runner.ts` (~965 lines) → removed. New code distributed to appropriate layers (~630 lines total, net -335 lines). No single file crosses the frontend/backend boundary.

---

## Modules That Do NOT Violate Boundaries

The following modules were analyzed and found to be layer-pure:

| Module | Classification | Why Not a Violation |
|--------|---------------|-------------------|
| `root-entry` | 操作 (primary) + 显示 (secondary) | Both are Frontend quadrants. The module calls into Backend layers through `executeRun()` but does not implement backend logic itself. The tool registration/dispatch + TUI rendering are both frontend concerns. |
| `registry-composer` | 计算 (primary) + 输出 (secondary) | Both are Backend quadrants. The composition computation and prompt text output are backend concerns. |
| `runtime-core` (secondary: 计算, 输出, 存储) | 操作 | **VIOLATION** — documented above. Secondary classifications spanning frontend/backend are the violation. |
| All other 13 modules | Single quadrant | Pure classification — no secondary that crosses the frontend/backend divide. |

---

## Summary

| Metric | Value |
|--------|-------|
| Total L2 modules | 16 |
| Boundary violators | 1 (`runtime-core`) |
| Violation rate | 6.25% |
| Root cause | Monolithic orchestrator pattern in single file |
| Recommended action | Split `runner.ts` into 2 new modules + disperse helpers to appropriate layers |
| Impact on Step 4 (directory reorg) | `runtime/runner.ts` cannot be placed in a single `frontend/` or `backend/` directory — must be split first |
| **Status after Step 4a** | **DEFERRED.** The split was not executed. `runtime/runner.ts` remains as a single 965-line monolithic file in `runtime/`. No `runtime-orchestrator.ts`, `tool-simulator.ts`, or dispersed helpers were created. The Step 4 directory reorganization to `frontend/` and `backend/` was fully deferred as a consequence. |
