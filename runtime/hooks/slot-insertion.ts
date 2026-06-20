import { setSlot } from "../prompt-slots/engine.ts";
import type { HookResult } from "./runner.ts";

export type HookPhase = "before_agent" | "after_agent" | "before_tool" | "after_tool";

export function injectHookOutputAsSlot(
  phase: HookPhase,
  result: HookResult,
  profileName: string,
): void {
  const slotName = `hook_${phase}_${profileName}`;
  const content = result.stdout
    ? `[Hook: ${phase}]\n\n${result.stdout}`
    : `[Hook: ${phase}] (no output)`;
  setSlot(slotName, content, undefined, -10);
}
