# `hooks/scripts/before-mkdir.ts`

Pre-mkdir hook that lists the target directory before the tool executes. Injects the `ls -la` output into the session so the agent can see the directory state before creating a new entry — useful for verifying parent structure, spotting collisions, or understanding placement context.

Self-contained by design: no external type imports, avoiding TypeScript resolution issues under dynamic `import()`.

## Exports

| Export | Kind | Line | Description |
|--------|------|------|-------------|
| `default` | `async function` | 6–29 | Runs `ls -la` at `ctx.cwd` (5s timeout), returns `allowed: true` with a `sessionMessage` containing the listing. On spawn failure returns the error message instead. Consumed by the hook runner in `runtime/hooks/`. |

## HookResult shape

```ts
{
  allowed: boolean;          // always true — informational hook, never blocks
  reason: string;            // "before-mkdir 检查通过"
  slotContent: null;         // no slot injection
  modifiedArgs: null;        // no arg modification
  sessionMessage?: { role: string; content: string };  // user-role message with ls output
}
```
