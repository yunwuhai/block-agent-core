// before-mkdir hook — runs ls before bash/mkdir operations
// Self-contained: no external type imports to avoid TypeScript resolution issues in dynamic import

import { spawnSync } from "node:child_process";

export default async function (ctx: { cwd: string }): Promise<{
  allowed: boolean;
  reason: string;
  slotContent: string | null;
  modifiedArgs: Record<string, unknown> | null;
  sessionMessage?: { role: string; content: string };
}> {
  const proc = spawnSync("ls", ["-la", ctx.cwd], { timeout: 5000 });
  const lsOutput = proc.error
    ? `[ls 失败] ${proc.error.message}`
    : proc.status !== 0
      ? `[ls 失败 (exit ${proc.status})] ${proc.stderr?.toString().trim()}`
      : proc.stdout?.toString().trim() || "";

  return {
    allowed: true,
    reason: "before-mkdir 检查通过",
    slotContent: null,
    modifiedArgs: null,
    sessionMessage: {
      role: "user",
      content: `=== mkdir 执行前 - 当前目录结构 ===\n${lsOutput}`,
    },
  };
}
