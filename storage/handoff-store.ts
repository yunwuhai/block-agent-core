import { writeFile } from "node:fs/promises";
import type { RunDirectory } from "./event-log.ts";

export interface HandoffBlock {
  readonly runId: string;
  readonly profile: string;
  readonly status: "completed" | "failed";
  readonly summary: string;
  readonly artifacts: readonly string[];
}

export async function writeHandoff(run: RunDirectory, block: HandoffBlock): Promise<string> {
  const content = [
    "# Handoff",
    "",
    `| Field | Value |`,
    `|-------|-------|`,
    `| Run ID | \`${block.runId}\` |`,
    `| Profile | ${block.profile} |`,
    `| Status | ${block.status} |`,
    "",
    "## Summary",
    "",
    block.summary,
    "",
    "## Artifacts",
    "",
    ...block.artifacts.map((a) => `- \`${a}\``),
    "",
    "---",
    "",
    `*Generated at ${isoNow()}*`,
  ].join("\n");
  await writeFile(run.handoffPath, content, "utf-8");
  return run.handoffPath;
}

function isoNow(): string {
  return new Date().toISOString();
}
