# `index.ts` — Extension Entry Point

**File**: `/home/whypc/workspace/efficiency-subagent/index.ts` (145 lines)

## Purpose

Entry point for the Efficiency Subagent PI Coding Agent extension. Registers the `efficiency_subagent` tool on the PI `ExtensionAPI`, bootstrapping the entire subagent lifecycle — profile resolution, policy evaluation, hook scripts, prompt slots, run orchestration, session recording, and TUI event rendering.

## Imports

| Module | What It Brings |
|---|---|
| `./config/mod.ts` | `ToolParamsSchema`, `ToolParams` — Zod-validated parameter schema |
| `./runtime/mod.ts` | `executeRun` — core run orchestration |
| `./runtime/prompt-slots/engine.ts` | `reset` (aliased `resetSlots`) — clears prompt slots each invocation |
| `./display/mod.ts` | `renderCompact`, `renderSectioned` — TUI event formatting |
| `./storage/mod.ts` | `listRunIds` — run directory listing |

## Exports

| Export | Kind | Lines | Description |
|---|---|---|---|
| `default` | function | 35–144 | Registers the `efficiency_subagent` tool. Accepts `pi: ExtensionAPI`, calls `pi.registerTool()` with the tool definition. |

## Internal Functions

| Name | Lines | Description |
|---|---|---|
| `renderText` | 31–33 | Wraps a string into an object satisfying PI's TUI `Box.render` contract (`{ render(): string }`). |

## Tool: `efficiency_subagent`

- **Parameters**: `profile` (required), `task` (required), `runId` (optional), `actions` (optional action sequence array).
- **Execute** (lines 70–125): Resets prompt slots, parses & validates params, calls `executeRun()`, renders result via `renderSectioned()`, returns `content` + `details` with structured run metadata.
- **renderCall** (lines 126–129): Shows `"Efficiency Subagent: {profile} — {task snippet}"`.
- **renderResult** (lines 130–143): Shows status with icon (`✓`/`🚫`/`✗`) and exit code.
