import type { HookContext, HookResult, HookSessionMessage } from "./types.ts";

const PLUGIN_DIR = new URL("../../..", import.meta.url).pathname;
const HOOKS_DIR = `${PLUGIN_DIR}/hooks/scripts/`;

const SAFE_SCRIPT_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

function timeoutPromise(ms: number): Promise<HookResult> {
  return new Promise((_resolve, reject) =>
    setTimeout(() => reject(new Error(`Hook timed out after ${ms}ms`)), ms),
  );
}

export async function runHookScripts(
  scripts: string[],
  ctx: HookContext,
  timeoutMs?: number,
): Promise<HookResult> {
  let aggregatedSlotContent = "";
  let lastModifiedArgs: Record<string, unknown> | null = null;
  const aggregatedSessionMessages: HookSessionMessage[] = [];

  for (const scriptName of scripts) {
    // Reject path traversal / directory separators in hook script names
    if (!SAFE_SCRIPT_NAME_RE.test(scriptName)) {
      return {
        allowed: false,
        reason: `Hook script name "${scriptName}" contains unsafe characters (only alphanumeric, hyphens, underscores allowed)`,
        slotContent: null,
        modifiedArgs: null,
      };
    }

    const scriptPath = `${HOOKS_DIR}${scriptName}.ts`;

    let hookModule: { default: (ctx: HookContext) => Promise<HookResult> };
    try {
      hookModule = await import(scriptPath);
    } catch {
      continue;
    }

    if (typeof hookModule.default !== "function") {
      continue;
    }

    try {
      const hookPromise = hookModule.default(ctx);
      const result = timeoutMs
        ? await Promise.race([hookPromise, timeoutPromise(timeoutMs)])
        : await hookPromise;

      if (!result.allowed) {
        return result;
      }

      if (result.slotContent !== null && result.slotContent !== "") {
        aggregatedSlotContent = aggregatedSlotContent
          ? `${aggregatedSlotContent}\n\n${result.slotContent}`
          : result.slotContent;
      }

      if (result.modifiedArgs !== null) {
        lastModifiedArgs = result.modifiedArgs;
      }

      if (result.sessionMessage) {
        aggregatedSessionMessages.push(result.sessionMessage);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        allowed: false,
        reason: `Hook "${scriptName}" failed: ${message}`,
        slotContent: null,
        modifiedArgs: null,
      };
    }
  }

  return {
    allowed: true,
    reason: "all hooks passed",
    slotContent: aggregatedSlotContent || null,
    modifiedArgs: lastModifiedArgs,
    ...(aggregatedSessionMessages.length > 0 ? { sessionMessage: aggregatedSessionMessages[aggregatedSessionMessages.length - 1]! } : {}),
  };
}
