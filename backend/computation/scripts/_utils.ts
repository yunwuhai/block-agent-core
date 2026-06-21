import { spawnSync } from "node:child_process";
import type { HookResult } from "../hooks/types.ts";

export function runLsWithTimeout(cwd: string, phase: string): HookResult {
  try {
    const result = spawnSync("ls", ["-la"], { cwd, timeout: 5000 });
    const output = result.status === 0
      ? result.stdout.toString().trim()
      : `ls failed (exit ${result.status}): ${result.stderr.toString().trim()}`;
    return {
      allowed: true,
      reason: `${phase} 检查通过`,
      slotContent: null,
      modifiedArgs: null,
      sessionMessage: {
        role: "user",
        content: `[${phase}] Directory listing for ${cwd}:\n\`\`\`\n${output}\n\`\`\``,
      },
    };
  } catch (err: any) {
    return {
      allowed: true,
      reason: `${phase} ls error: ${err.message}`,
      slotContent: null,
      modifiedArgs: null,
      sessionMessage: {
        role: "user",
        content: `[${phase}] Failed to list directory ${cwd}: ${err.message}`,
      },
    };
  }
}
