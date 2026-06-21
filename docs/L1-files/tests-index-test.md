# tests/index.test.ts

**Purpose:** Verify the extension entry point (`index.ts`) correctly registers the `efficiency_subagent` tool with the PI Coding Agent API via a fake `ExtensionAPI` mock.

**Test suite:** `"Efficiency Subagent extension"` (line 5–68)

| Test (line) | Scenario | Assertion |
|---|---|---|
| L6 | Default export is a function | `typeof extension === "function"` |
| L10 | Registers exactly one tool with expected identity | 1 tool registered; `name === "efficiency_subagent"`, `label === "Efficiency Subagent"` |
| L24 | Parameter schema requires `profile` and `task` | `params.required` contains both `"profile"` and `"task"` |
| L38 | Execute rejects empty/invalid params | Calling `execute("", {})` returns `terminate: true` with invalid-param text |
| L55 | Render call formats profile + task into output | `render({ profile: "worker", task: "fix bugs" }).render(80)` returns text containing both values |

**Key design notes:**
- All tests use a local `fakeApi` mock (stores registered tool in a local array) — no real PI agent required.
- Coverage focuses on **tool registration shape** (name, label, params schema) and **runtime contract** (execute error handling, render-call formatting).
- Does not test actual subagent execution (runtime, permissions, slots) — those live in their own test files.
