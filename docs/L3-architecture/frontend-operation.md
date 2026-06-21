# L3 Architecture: Frontend — 操作 (Operation)

Layer for modules that handle user commands, tool dispatch, and interaction flow — the execution control surface of the system.

> **Quadrant definition:** Modules that handle user commands, tool dispatch, interaction flow.

## Member Modules

| # | Module | Primary | Secondary | Description | L2 Doc |
|---|--------|---------|-----------|-------------|--------|
| 1 | `runtime-core` | 操作 | 计算, 输出, 存储 | ⚠️ Boundary-crossing orchestrator. Central execution lifecycle: tool dispatch action loop, policy enforcement, hook dispatch, session persistence, handoff generation. | [runtime-core.md](../L2-modules/runtime-core.md) |
| 2 | `root-entry` | 操作 | 显示 | Extension entry point: registers `efficiency_subagent` tool, validates parameters, dispatches to `executeRun()`, renders TUI results. Sole integration boundary. | [root-entry.md](../L2-modules/root-entry.md) |

---

## Module Detail: `runtime-core`

**Purpose:** Central execution lifecycle for subagent runs. This is the top-level orchestrator that ties together profile loading, policy enforcement, prompt rendering, hook dispatch, tool simulation, session persistence, transcript generation, and structured handoff output. It is the integration hub through which all other `runtime/` subsystems are wired.

**⚠️ Boundary-crossing:** This module spans Frontend (Operation) and all four Backend quadrants. See [_bugs.md](./_bugs.md) for detailed boundary violation analysis and split recommendations.

### Member L1 Files

| L1 Doc | Source File | Role |
|--------|-------------|------|
| `runtime-runner.md` | `runtime/runner.ts` (~965 lines) | Primary orchestrator: `executeRun()` entry point, action loop, helpers for policy/hooks/retry/handoff |
| `runtime-mod.md` | `runtime/mod.ts` (4 lines) | Trivial barrel re-exporting `executeRun`, `RunContext`, `RunResult` |

### Key Exports

- `executeRun(ctx: RunContext): Promise<RunResult>` — Primary entry point. Orchestrates the full 17-phase lifecycle.
- `RunContext` — Input parameters: `cwd`, `params` (ToolParams), optional `signal`, `timeoutMs`
- `RunResult` — Return shape: `runId`, `status` (completed/failed/blocked), `handoffPath`, `runDir`, `events`, `output`, optional `transcript`

### Lifecycle Phases (the 17-phase action loop)

1. Timeout & signal setup
2. Run ID resolution (continuation support)
3. Run directory creation + registry init
4. Session metadata persistence
5. Continuation consistency check
6. Slot restore (deserializes `slots.json`)
7. Profile loading
8. Policy merge (project → PolicyEntry → MergedPolicy)
9. Phase hooks (`before_agent` — may block)
10. Placeholder + registry registration from profile
11. Prompt build (`renderPromptWithRegistry()`)
12. **Action loop** — per-action: `executeWithRetry()` → `simulateToolInteraction()` (policy evaluate → before_tool hook → tool call → after_tool hook)
13. Phase hooks (`after_agent`)
14. Transcript build (markdown to `transcript.md`)
15. Handoff generation (filesTouched, toolSummary, blockContext)
16. Run end events + slot/registry persistence
17. Return `RunResult`

### Why Primary = 操作

Despite performing computation, storage, and output, `runtime-core` is classified as 操作 because its **core identity** is the action loop (Phase 12) — dispatching tool invocations and managing the interaction flow. The tool simulation cycle is what makes this module an "operation" module: `simulateToolInteraction()` → policy check → hook execution → tool dispatch → result collection. The other responsibilities (storage, output) are incidental to the orchestration role and are documented as boundary violations in [_bugs.md](./_bugs.md).

---

## Module Detail: `root-entry`

**Purpose:** Extension entry point — the sole integration boundary between the efficiency-subagent extension and the PI Coding Agent host. Registers the `efficiency_subagent` tool on the `ExtensionAPI`, bootstrapping the full subagent lifecycle.

### Member L1 Files

| L1 Doc | Source File | Role |
|--------|-------------|------|
| `index.md` | `index.ts` (145 lines) | Single-file module: tool registration, parameter validation, `executeRun()` dispatch, TUI rendering |

### Key Exports

- **Default export:** Function receiving `pi: ExtensionAPI` → calls `pi.registerTool()` with `efficiency_subagent` definition
- **Tool parameters:** `profile` (required), `task` (required), `runId` (optional), `actions` (optional)
- **Execute handler (lines 70–125):**
  1. `resetSlots()` — clears prompt slots
  2. `ToolParamsSchema` validation
  3. `executeRun()` — dispatches to runtime-core
  4. `renderSectioned()` — renders TUI event stream
  5. Returns `content` + `details` with structured run metadata
- **Rendering:** `renderCall` shows `"Efficiency Subagent: {profile} — {task snippet}"`; `renderResult` shows status with icon and exit code

### Dependencies

- `config-mod.md` → `ToolParamsSchema` for validation
- `runtime-mod.md` → `executeRun` for orchestration
- `prompt-engine` → `reset()` for slot clearing
- `display-mod.md` → `renderCompact`, `renderSectioned` for TUI output

### Why Primary = 操作

`root-entry` is the **operation front door** of the entire system. It registers the user-facing tool, receives user commands, validates them, and dispatches to the execution engine. Its secondary 显示 role comes from rendering TUI results, but its primary identity is as the command dispatch and tool registration layer — the entry point through which all user operations flow.

---

## Layer Position in Architecture

```
┌──────────────────────────────────────────────────┐
│                  FRONTEND                         │
│  ┌────────────────┐  ┌────────────────────────┐  │
│  │   显示 (Display) │  │  操作 (Operation)       │  │
│  │   display-tui   │  │  root-entry ◄── user    │  │
│  │                 │  │      │                  │  │
│  │                 │  │  runtime-core           │  │
│  │                 │  │  (action loop,          │  │
│  │                 │  │   tool dispatch)        │  │
│  └────────────────┘  └──────────┬─────────────┘  │
├─────────────────────────────────┼────────────────┤
│                  BACKEND        │                 │
│  ┌──────┐ ┌───────┐ ┌─────────┐▼┌────────────┐  │
│  │ 输入  │ │ 输出   │ │ 存储     │ │ 计算        │  │
│  └──────┘ └───────┘ └─────────┘ └────────────┘  │
└──────────────────────────────────────────────────┘
```

The 操作 layer is the **execution control surface** — it receives user commands through `root-entry`, delegates to backend layers for computation/storage/output, and coordinates the interaction lifecycle through `runtime-core`. It is the only layer that directly handles the user's tool invocation flow.
