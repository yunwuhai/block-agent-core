# Module: hook-scripts

**Purpose:** Collection of shell-executable hook scripts that run before and after agent/tool lifecycle events. Each script receives a `HookContext`, performs an action (typically spawning a shell command or reading filesystem state), and returns a `HookResult` that may include a session message for the agent and/or slot content for prompt injection. All scripts are loaded dynamically by the hook runner via `import()` and identified by filename (without `.ts` extension) in profile hook configuration.

## Member Files

| L1 Doc | Source File | Role |
|--------|-------------|------|
| [hooks-scripts-_example.md](../L1-files/hooks-scripts-_example.md) | `hooks/scripts/_example.ts` | Template/reference — demonstrates the minimal HookContext → HookResult contract |
| [hooks-scripts-before-mkdir.md](../L1-files/hooks-scripts-before-mkdir.md) | `hooks/scripts/before-mkdir.ts` | Pre-mkdir inspection — runs `ls -la` before directory creation |
| [hooks-scripts-after-mkdir.md](../L1-files/hooks-scripts-after-mkdir.md) | `hooks/scripts/after-mkdir.ts` | Post-mkdir inspection — runs `ls -la` after directory creation |
| [hooks-scripts-announce-phase.md](../L1-files/hooks-scripts-announce-phase.md) | `hooks/scripts/announce-phase.ts` | Phase announcement — injects Korean-localized phase labels into slots and session |
| [hooks-scripts-registry-output.md](../L1-files/hooks-scripts-registry-output.md) | `hooks/scripts/registry-output.ts` | Registry snapshot — captures directory listing + registry.jsonl entry count |

## Per-File Contribution Summary

### hooks/scripts/_example.ts
Template hook illustrating the minimal contract. Receives `HookContext` (`phase`, `profile`, runtime data), returns `{ allowed: true, reason: "example always passes" }` with a `slotContent` message. Referenced in profile config as `"_example"`. Never blocks — purely informational.

### hooks/scripts/before-mkdir.ts
Runs `ls -la` at `ctx.cwd` (5s timeout via `spawnSync`). Returns a `sessionMessage` containing the directory listing so the agent can verify parent structure before creating a new directory. Always returns `allowed: true`. Self-contained — no external type imports to avoid resolution issues under dynamic `import()`.

### hooks/scripts/after-mkdir.ts
Mirrors before-mkdir but executes after `mkdir` completes. Runs `ls -la` on the target directory and injects the listing as a `sessionMessage` formatted as `=== mkdir 执行后 - 当前目录结构 ===\n<output>`. On spawn failure, returns the error message instead. Always returns `allowed: true`.

### hooks/scripts/announce-phase.ts
Maps `ctx.phase` (`before_agent`, `after_agent`, `before_tool`, `after_tool`) to Korean-localized labels (e.g., `🚀 Agent 启动前`). Builds a `slotContent` string with profile/task/runId metadata and a `sessionMessage` prefixed with `📢 [Hook 会话消息]`. Runs at every phase. Imports `HookContext`/`HookResult` from `../../runtime/hooks/types.ts`.

### hooks/scripts/registry-output.ts
Dual-purpose hook: (1) provides a real-time filesystem snapshot via `ls -la`, and (2) exercises the registry auto-registration mechanism by reading `registry.jsonl` entry count. The `slotContent` bundles directory listing + registry info with phase label and timestamp. Serves as both a debugging aid and integration test for the registry pipeline. Self-contained — no external type imports.

## Internal Relationships

```
hooks/scripts/_example.ts  ──template──▶  Defines the HookContext → HookResult contract
                                                 │
                    ┌────────────────────────────┼────────────────────────────┐
                    ▼                            ▼                            ▼
          before-mkdir.ts              announce-phase.ts            registry-output.ts
          after-mkdir.ts
```

- **Shared contract**: All scripts implement the same `async (ctx: HookContext) => Promise<HookResult>` signature
- **before-mkdir / after-mkdir**: Paired scripts — semantically coupled (pre/post directory creation) but functionally independent (no shared code or imports between them)
- **_example.ts**: Reference implementation; not used in production profiles
- **Loose coupling**: Each script is self-contained and independently loadable. No script imports another script.

## External Dependencies

### Consumers (who depends on this module)
| L1 Doc | Relationship |
|--------|-------------|
| [runtime-hooks-runner.md](../L1-files/runtime-hooks-runner.md) | Loads and executes hook scripts via dynamic `import()` at each lifecycle phase |
| [runtime-hooks-slot-insertion.md](../L1-files/runtime-hooks-slot-insertion.md) | Consumes `slotContent` from hook results for prompt slot injection |
| [registry-mod.md](../L1-files/registry-mod.md) | registry-output hook writes to and reads from the registry pipeline |

### Upstream (what this module depends on)
| L1 Doc | Relationship |
|--------|-------------|
| [runtime-hooks-types.md](../L1-files/runtime-hooks-types.md) | `HookContext` and `HookResult` types — imported by `announce-phase.ts`; implicitly relied upon by all scripts |
| `node:child_process` | `spawnSync` — used by before-mkdir, after-mkdir, and registry-output for shell command execution |
| `node:fs` | `readFileSync` — used by registry-output to read `registry.jsonl` |

### Configuration Dependency
Scripts are activated by adding their filename (without `.ts`) to a profile's `hooks.before_agent`, `hooks.after_agent`, `hooks.before_tool`, or `hooks.after_tool` arrays. See profile configuration in [config-profile-loader.md](../L1-files/config-profile-loader.md) and [config-schema.md](../L1-files/config-schema.md).

## Physical Location

| Source File | Current Path | Notes |
|------------|-------------|-------|
| `hooks/scripts/_example.ts` | `hooks/scripts/_example.ts` | Template — minimal HookContext → HookResult contract |
| `hooks/scripts/before-mkdir.ts` | `hooks/scripts/before-mkdir.ts` | Pre-mkdir inspection via `ls -la` |
| `hooks/scripts/after-mkdir.ts` | `hooks/scripts/after-mkdir.ts` | Post-mkdir inspection via `ls -la` |
| `hooks/scripts/announce-phase.ts` | `hooks/scripts/announce-phase.ts` | Korean-localized phase announcements |
| `hooks/scripts/registry-output.ts` | `hooks/scripts/registry-output.ts` | Registry snapshot + filesystem listing |

> **Step 4a status: DEFERRED.** Files remain in the legacy `hooks/` directory. Planned move to `backend/computation/` not executed.
