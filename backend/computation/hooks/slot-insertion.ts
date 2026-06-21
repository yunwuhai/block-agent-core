import { setSlot, getRegistry, getOrchestrator } from "../prompt/engine.ts";
import type { HookResult } from "./types.ts";
import type { HookContext } from "./types.ts";

export type HookPhase = "before_agent" | "after_agent" | "before_tool" | "after_tool";

export function injectHookOutputAsSlot(
  phase: HookPhase,
  result: HookResult,
  profileName: string,
): void {
  if (!result.slotContent || result.slotContent === "") {
    return;
  }
  const slotName = `hook_${phase}_${profileName}`;
  const content = `[Hook: ${phase}]\n\n${result.slotContent}`;
  setSlot(slotName, content, -10);
}

/**
 * Register hook output as a Prompt Registry entry with auto-scheduling.
 *
 * Creates a `type: "hook-output"` entry tagged with the phase, tool name,
 * and profile. The entry has `lifecycle: session` (expires at run end) and
 * is automatically scheduled for injection in the next outgoing message.
 *
 * Falls back to `injectHookOutputAsSlot()` if the registry is not active.
 *
 * @param result      — The hook execution result containing `slotContent`.
 * @param ctx         — Hook context (phase, toolName, profile, etc.).
 * @returns The registered entry ID, or `null` if no output to register.
 */
export function registerHookOutput(
  result: HookResult,
  ctx: HookContext,
): string | null {
  if (!result.slotContent || result.slotContent === "") return null;

  const storage = getRegistry();
  const orchestrator = getOrchestrator();

  if (!storage || !orchestrator) {
    injectHookOutputAsSlot(ctx.phase, result, ctx.profile);
    return null;
  }

  const tags = [ctx.phase, ctx.toolName ?? "agent", ctx.profile, "auto-generated"];
  const id = storage.register({
    type: "hook-output",
    description: `${ctx.toolName ?? "agent"} ${ctx.phase} output`,
    content: result.slotContent,
    tags,
    group: "hook-outputs",
    priority: 0,
    lifecycle: { type: "session", createdAt: Date.now() },
    createdBy: "hook",
  });

  orchestrator.scheduleIds([id]);
  return id;
}
