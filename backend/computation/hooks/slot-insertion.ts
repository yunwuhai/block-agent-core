import { setSlot } from "../prompt-slots/engine.ts";
import type { HookResult } from "./types.ts";

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
