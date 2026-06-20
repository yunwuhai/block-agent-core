import type { HookContext, HookResult } from "../../runtime/hooks/types.ts";

async function runLs(dir: string): Promise<string> {
  const proc = Bun.spawn(["ls", "-la", dir], { stdout: "pipe", stderr: "pipe" });
  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const errOutput = await new Response(proc.stderr).text();
    return `[ls 失败 (exit ${exitCode})] ${errOutput.trim()}`;
  }
  return output.trim();
}

export default async function (ctx: HookContext): Promise<HookResult> {
  const targetDir = ctx.cwd;

  let lsOutput: string;
  try {
    lsOutput = await runLs(targetDir);
  } catch (err) {
    lsOutput = `[无法执行 ls 命令: ${err instanceof Error ? err.message : String(err)}]`;
  }

  const header = "=== mkdir 执行前 - 当前目录结构 ===";
  const content = `${header}\n${lsOutput}`;

  return {
    allowed: true,
    reason: "before-mkdir 检查通过",
    slotContent: null,
    modifiedArgs: null,
    sessionMessage: {
      role: "user",
      content,
    },
  };
}
