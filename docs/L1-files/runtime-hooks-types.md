# `runtime/hooks/types.ts` — Hook Type Definitions

**Purpose:** Type-only module defining the core data structures used by the hook scripting system. All types consumed by `runtime/hooks/runner.ts` and hook script implementations.

## Exports

| Export | Kind | Lines | Description |
|---|---|---|---|
| `HookContext` | `interface` | 1–9 | Readonly context passed into every hook invocation. Fields: `phase` (which hook lifecycle point), `profile`, `task`, `runId`, `cwd`, optional `toolName` and `toolArgs`. |
| `HookSessionMessage` | `interface` | 11–14 | Represents a single message in the ongoing session transcript. `role` is `"user"` or `"assistant"`, `content` holds the raw message text. |
| `HookResult` | `interface` | 16–22 | Return value from a hook script. Controls execution flow via `allowed` (boolean gate), `reason` (why disallowed), `slotContent` (text to inject into the dynamic prompt slot), `modifiedArgs` (tool argument overrides), and optional `sessionMessage` (message appended to the session transcript). |
