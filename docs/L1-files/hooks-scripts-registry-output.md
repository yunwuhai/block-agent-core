# `hooks/scripts/registry-output.ts`

**Purpose:** Hook script that captures a directory listing snapshot and registry state before/after an agent or tool operation. The output (`slotContent`) is injected into a dynamic prompt slot and automatically registered into the Prompt Registry via `registerHookOutput()`. Self-contained design avoids external type imports, ensuring compatibility with dynamic `import()`.

This hook serves dual purpose: (1) provides the agent with a real-time filesystem snapshot for context, and (2) exercises the registry auto-registration mechanism, serving as both a debugging aid and integration test for the registry pipeline.

---

## Exports

| # | Export | Kind | Lines | Description |
|---|--------|------|-------|-------------|
| 1 | `default` | async function | 8–54 | Hook handler invoked by the hook runner. Receives `ctx` (`cwd`, `phase`, optional `toolName`). Runs `spawnSync("ls", ["-la"])` on `cwd` with 5s timeout, then reads `registry.jsonl` entry count from disk via `readFileSync`. Returns `allowed: true` with `slotContent` bundling directory listing + registry info, plus a `sessionMessage` for agent context. |

**Return shape:** `{ allowed, reason, slotContent, modifiedArgs, sessionMessage? }`

**Key behavior:** The `slotContent` string includes a phase label, timestamp, working directory, the full `ls -la` output (or error message if the command fails), and the number of existing registry entries (or a "first run" note if no registry file exists). The `allowed: true` + `reason` combo signals the hook runner to proceed and inject the slot content.
