# tests/hooks.test.ts

## Purpose

Tests for the hook scripts subsystem of the efficiency-subagent extension. Validates three concerns: (1) the TypeScript hook script runner's ability to execute and block hooks, (2) the slot-injection mechanism that pipes hook output into the prompt slot engine, and (3) the `sessionMessage` contract on `HookResult`. Uses temporary filesystem scripts and a fresh slot engine per test.

## Test Suites

### Hook script runner (TypeScript) (lines 31–80)

Tests `runHookScripts` from `../runtime/hooks/runner.ts`:

| Test | Line | Scenario |
|------|------|----------|
| runs a hook script and returns allowed result | 32 | Verifies `runHookScripts` is a function (signature check); temp scripts created with `makeScript` helper |
| handles missing script gracefully | 47 | `runHookScripts(["nonexistent-script"], ...)` returns `{ allowed: true }` — missing scripts do not block |
| blocks when hook returns allowed=false | 52 | Asserts `HookResult` type with `allowed: false` and a reason string |
| returns sessionMessage when hook provides one | 68 | Constructs a `HookResult` with `sessionMessage` and asserts `role`/`content` fields |

### Hook slot insertion (lines 82–119)

Tests `injectHookOutputAsSlot` from `../runtime/hooks/slot-insertion.ts`:

| Test | Line | Scenario |
|------|------|----------|
| injects hook output as a named slot | 83 | Non-null `slotContent` creates slot key `hook_{phase}_{profile}` with the content |
| skips slot injection when slotContent is null | 96 | Null `slotContent` → no slot created |
| skips slot injection when slotContent is empty string | 108 | Empty-string `slotContent` → no slot created |

### Hook sessionMessage contract (lines 121–150)

Verifies the optional `sessionMessage` field on `HookResult`:

| Test | Line | Scenario |
|------|------|----------|
| sessionMessage present: role and content accessible | 122 | Object literal with `sessionMessage` → fields are defined and match |
| sessionMessage absent: undefined | 135 | Object without `sessionMessage` → field is `undefined` |
| runHookScripts with missing scripts returns allowed but no sessionMessage | 145 | Integration-style: non-existent script path returns `allowed: true` with `sessionMessage` undefined |

## Key Patterns

- **`makeScript()` helper** (line 16): writes a `.ts` file under `/tmp/hook-test-*` with the given source. Each test uses a `randomUUID`-based name to avoid collisions.
- **`reset()` call in `afterEach`** (line 12): clears the global slot engine between tests for isolation.
- **TMP cleanup** (line 12): recursive `rmSync` of the temp directory after each test (best-effort).
- **Type-level testing**: several tests assert `HookResult` shape with inline object literals rather than running real scripts, because script resolution depends on `import.meta.url` runtime paths.
