import type { HookContext, HookResult } from "../hooks/types.ts";
import { runLsWithTimeout } from "./_utils.ts";

export default async function(ctx: HookContext): Promise<HookResult> {
  return runLsWithTimeout(ctx.cwd, "before-mkdir");
}
