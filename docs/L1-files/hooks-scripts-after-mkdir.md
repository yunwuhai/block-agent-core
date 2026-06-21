# hooks/scripts/after-mkdir.ts

## Purpose

Hook script executed after a `mkdir` tool call. Runs `ls -la` on the target directory and injects the listing into the session as a user message, giving the agent immediate visibility into the newly created directory structure.

## Exports

### `default` (async function) — lines 6–30

**Signature:**
```ts
(ctx: { cwd: string }) => Promise<{
  allowed: boolean;
  reason: string;
  slotContent: string | null;
  modifiedArgs: Record<string, unknown> | null;
  sessionMessage?: { role: string; content: string };
}>
```

**Behavior:**
- Spawns `ls -la` with a 5-second timeout via `spawnSync` (`node:child_process`).
- On success: returns the `ls` output in `sessionMessage` formatted as `=== mkdir 执行后 - 当前目录结构 ===\n<ls_output>`.
- On failure (error or non-zero exit): returns the error message or stderr in Chinese within the same session message shape.
- Always returns `{ allowed: true, reason: "after-mkdir 检查通过", slotContent: null, modifiedArgs: null }` — the hook never blocks execution.
