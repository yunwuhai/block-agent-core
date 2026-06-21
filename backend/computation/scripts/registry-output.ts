// registry-output hook — 返回 slotContent 以测试 registry 自动注册功能
// Self-contained: no external type imports for dynamic import compatibility

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export default async function (ctx: { cwd: string; phase: string; toolName?: string }): Promise<{
  allowed: boolean;
  reason: string;
  slotContent: string | null;
  modifiedArgs: Record<string, unknown> | null;
  sessionMessage?: { role: string; content: string };
}> {
  const proc = spawnSync("ls", ["-la", ctx.cwd], { timeout: 5000 });
  const lsOutput = proc.error
    ? `[ls failed] ${proc.error.message}`
    : proc.status !== 0
      ? `[ls failed (exit ${proc.status})] ${proc.stderr?.toString().trim()}`
      : proc.stdout?.toString().trim() || "(empty)";

  // 返回 slotContent — 这将被 registerHookOutput() 自动注册为 registry 条目
  const slotContent = [
    `=== Hook: ${ctx.phase} / tool: ${ctx.toolName ?? "N/A"} ===`,
    `Time: ${new Date().toISOString()}`,
    `Working directory: ${ctx.cwd}`,
    ``,
    `Directory listing (before operation):`,
    `\`\`\``,
    lsOutput,
    `\`\`\``,
  ].join("\n");

  // 同时检查 registry.jsonl 是否存在（如果存在，读取条目数量）
  let registryInfo = "";
  try {
    const registryPath = join(ctx.cwd, "registry.jsonl");
    const content = readFileSync(registryPath, "utf-8");
    const entryCount = content.trim().split("\n").filter(Boolean).length;
    registryInfo = `\nRegistry entries on disk: ${entryCount}`;
  } catch {
    registryInfo = "\nRegistry file not found (first run?)";
  }

  return {
    allowed: true,
    reason: `registry-output: ${ctx.phase} phase completed`,
    slotContent: slotContent + registryInfo,
    modifiedArgs: null,
    sessionMessage: {
      role: "user",
      content: `📋 [Hook Message] ${ctx.phase} for ${ctx.toolName ?? "agent"} — directory listing captured and registered in Prompt Registry`,
    },
  };
}
