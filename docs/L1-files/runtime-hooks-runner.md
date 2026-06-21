# `runtime/hooks/runner.ts` — Hook Script Executor

## File Purpose

Imports hook script modules from `hooks/scripts/`, runs them sequentially against a shared `HookContext`, and aggregates results (slot content, modified args, session messages). Each hook returns an `allowed: boolean` decision — any hook can veto the operation. Includes safety guards against path traversal in script names and per-hook timeout support.

## Exports

### `runHookScripts(scripts, ctx, timeoutMs?)`

| | |
|---|---|
| **Line range** | `19`–`101` |
| **Description** | Iterates over a list of hook script names (without `.ts` extension). For each: validates the name with `SAFE_SCRIPT_NAME_RE` (no path traversal), resolves to `hooks/scripts/<name>.ts`, dynamic-imports it, and calls its default export with `ctx`. Aggregates `slotContent` (concatenated with double-newline separators), `modifiedArgs` (last writer wins), and `sessionMessage` (last writer wins). On timeout (`timeoutMs`), rejection, or a hook returning `allowed: false`, the entire run short-circuits with a failure result. |
| **Returns** | `Promise<HookResult>` — `{ allowed, reason, slotContent, modifiedArgs, sessionMessage? }` |

## Internal Helpers

| Name | Lines | Description |
|---|---|---|
| `timeoutPromise` | `13`-`17` | Returns a `Promise<HookResult>` that rejects after `ms` milliseconds with a timeout error. Used in `Promise.race` to enforce per-hook deadlines. |

## Constants

| Name | Value (resolved) | Description |
|---|---|---|
| `PLUGIN_DIR` | `resolve(__dirname, "..", "..")` | Project root (2 levels up from `runtime/hooks/`) |
| `HOOKS_DIR` | `resolve(PLUGIN_DIR, "hooks", "scripts")` | Directory where hook `.ts` scripts live |
| `SAFE_SCRIPT_NAME_RE` | `/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/` | Rejects names with `/`, `..`, or other unsafe characters |
