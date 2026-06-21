# Module: root-entry

**Purpose:** Extension entry point. Registers the `efficiency_subagent` tool on the PI Coding Agent `ExtensionAPI`, bootstrapping the full subagent lifecycle: parameter validation, prompt slot reset, policy-enforced run orchestration, hook script execution, session recording, and TUI event rendering. This is the single integration surface between the extension and the PI agent host.

## Member Files

| L1 Doc | Source File | Role |
|--------|-------------|------|
| [index.md](../L1-files/index.md) | `index.ts` (145 lines) | Extension entry point — registers `efficiency_subagent` tool, orchestrates imports from all sub-modules |

## Per-File Contribution Summary

### index.ts
The sole member of this module. Contains:

- **Default export**: A function receiving `pi: ExtensionAPI` that calls `pi.registerTool()` with the `efficiency_subagent` tool definition
- **Tool parameters**: `profile` (required), `task` (required), `runId` (optional), `actions` (optional)
- **Execute handler** (lines 70–125):
  1. Resets prompt slots via `resetSlots()`
  2. Parses and validates parameters against `ToolParamsSchema`
  3. Calls `executeRun()` from runtime
  4. Renders the execution event stream via `renderSectioned()`
  5. Returns `content` + `details` with structured run metadata (profile, task, runId, exit code, duration)
- **renderCall**: Shows `"Efficiency Subagent: {profile} — {task snippet}"`
- **renderResult**: Shows status with icon (`✓`/`🚫`/`✗`) and exit code
- **Internal helper**: `renderText()` — wraps a string into PI's TUI `Box.render` contract

## Internal Relationships

```
index.ts (sole file — no internal coupling)
```

This module is a single-file module. All coupling is external (see below).

## External Dependencies

### Imports (what this module depends on)

| L1 Doc | Import | Used For |
|--------|--------|----------|
| [config-mod.md](../L1-files/config-mod.md) | `ToolParamsSchema`, `ToolParams` | Zod-validated parameter schema for the tool |
| [runtime-mod.md](../L1-files/runtime-mod.md) | `executeRun` | Core run orchestration — the main execution pipeline |
| [runtime-prompt-slots-engine.md](../L1-files/runtime-prompt-slots-engine.md) | `reset` (aliased `resetSlots`) | Clears prompt slots at the start of each invocation |
| [display-mod.md](../L1-files/display-mod.md) | `renderCompact`, `renderSectioned` | TUI event rendering for execution results |
| [storage-mod.md](../L1-files/storage-mod.md) | `listRunIds` | Run directory listing |

### Downstream Chain (modules activated through this entry point)

```
index.ts
  ├── config/mod.ts          → ToolParamsSchema validation
  ├── runtime/mod.ts         → executeRun()
  │     ├── policy/          → permission enforcement
  │     ├── runtime/hooks/   → hook script execution
  │     ├── runtime/prompt-slots/ → dynamic slot engine
  │     └── storage/         → session recording, handoff, transcript
  └── display/mod.ts         → TUI rendering
```

## Physical Location

| Source File | Current Path | Notes |
|------------|-------------|-------|
| `index.ts` | `index.ts` | Extension entry point — registers `efficiency_subagent` tool on PI Coding Agent |

> **Step 4a status: DEFERRED.** File remains at project root. Planned move to `frontend/operation/` not executed.

### Architectural Role
This module is the **sole integration boundary** between the extension and the PI agent host. All other modules are internal implementation details reachable only through the execution chain bootstrapped here. The tool name `"efficiency_subagent"` registered here is hardcoded in [policy-evaluator.md](../L1-files/policy-evaluator.md) as `SUBAGENT_TOOL_NAME` for nested-subagent gating — a shared-string coupling that must be kept in sync.
