import type { HookContext, HookResult } from "../hooks/types.ts";

/**
 * announce-phase — 在任意 hook phase 中注入 slot 内容和 session 消息。
 *
 * 此钩子返回 slotContent（经 injectHookOutputAsSlot 注入为 prompt slot），
 * 同时返回 sessionMessage（作为用户消息直接插入会话）。
 */
export default async function (ctx: HookContext): Promise<HookResult> {
  const phaseLabel =
    ctx.phase === "before_agent" ? "🚀 Agent 启动前" :
    ctx.phase === "after_agent"  ? "🏁 Agent 结束后" :
    ctx.phase === "before_tool"  ? `🔧 工具 ${ctx.toolName ?? "?"} 调用前` :
    ctx.phase === "after_tool"   ? `✅ 工具 ${ctx.toolName ?? "?"} 调用后` :
    ctx.phase;

  const slotContent = `[Slot: ${phaseLabel}]\nProfile: ${ctx.profile}\nTask: ${ctx.task}\nRun: ${ctx.runId}`;

  const sessionMessage = `📢 [Hook 会话消息] 当前阶段: ${phaseLabel}, Profile: ${ctx.profile}`;

  return {
    allowed: true,
    reason: `announce-phase 在 "${ctx.phase}" 阶段通过`,
    slotContent,
    modifiedArgs: null,
    sessionMessage: {
      role: "user",
      content: sessionMessage,
    },
  };
}
