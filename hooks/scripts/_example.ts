import type { HookContext, HookResult } from "../../runtime/hooks/types.ts";

/**
 * Example hook — demonstrates the hook script interface.
 *
 * Hook scripts live in hooks/scripts/ and are referenced by name
 * (without extension) in profile hook configuration.
 *
 * Each hook exports a default async function that receives a HookContext
 * and returns a HookResult.
 *
 * To use: add "_example" to a profile's hooks.before_agent or hooks.after_agent array.
 */
// eslint-disable-next-line import/no-default-export
export default async function (ctx: HookContext): Promise<HookResult> {
  const message = `Example hook running in phase "${ctx.phase}" for profile "${ctx.profile}"`;

  return {
    allowed: true,
    reason: "example always passes",
    slotContent: message,
    modifiedArgs: null,
    // sessionMessage: injects a message directly into the agent conversation
    // (e.g. to show ls output before/after a tool call like before-mkdir.ts does).
    // Set to undefined/omit when no session injection is needed.
    sessionMessage: undefined,
  };
}
