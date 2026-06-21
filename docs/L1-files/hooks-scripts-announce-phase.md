# `hooks/scripts/announce-phase.ts`

## Purpose

Hook script that injects a human-readable phase announcement into both a
**prompt slot** (for downstream agent/tool consumption) and a **session
message** (visible in the conversation log). Runs at every hook phase
(`before_agent`, `after_agent`, `before_tool`, `after_tool`).

## Exports

| # | Export | Kind | Lines | Description |
|---|--------|------|-------|-------------|
| 1 | `default` | `async (ctx: HookContext) => Promise<HookResult>` | 9–30 | Maps `ctx.phase` to a Korean-localised label (e.g. `🚀 Agent 启动前`), builds a `slotContent` string with profile/task/runId metadata, and a `sessionMessage` prefixed with `📢 [Hook 会话消息]`. Returns `{ allowed: true, slotContent, sessionMessage }`. |

## Dependencies

- `../../runtime/hooks/types.ts` — `HookContext`, `HookResult` types.
