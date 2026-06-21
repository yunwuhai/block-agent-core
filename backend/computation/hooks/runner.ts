import type { HookContext, HookResult, HookSessionMessage } from "./types.ts";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLUGIN_DIR = resolve(__dirname, "..", "..", "..");
const HOOKS_DIR = resolve(__dirname, "..", "scripts");

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

  // Diagnostic: log resolved paths on first hook execution to help PI runtime debugging
  if (scripts.length > 0) {
    console.log("[efficiency-subagent hooks] PLUGIN_DIR:", PLUGIN_DIR);
    console.log("[efficiency-subagent hooks] HOOKS_DIR:", HOOKS_DIR);
  }

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

    const scriptPath = resolve(HOOKS_DIR, `${scriptName}.ts`);

    let hookModule: { default: (ctx: HookContext) => Promise<HookResult> };
    try {
      console.log("[efficiency-subagent hooks] Importing hook script:", scriptPath);
      hookModule = await import(scriptPath);
      console.log("[efficiency-subagent hooks] Hook script loaded:", scriptName);
    } catch (err: unknown) {
      console.warn("[efficiency-subagent hooks] Hook import failed:", scriptName, err instanceof Error ? err.message : String(err));
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
