import { writeFile } from "node:fs/promises";
import type { RunDirectory } from "../storage/run-artifacts.ts";

export interface FileTouch {
  readonly path: string;
  readonly operation: "read" | "write" | "edit" | "delete" | "bash";
}

export interface ToolSummary {
  readonly toolName: string;
  readonly count: number;
}

export interface HandoffBlock {
  readonly runId: string;
  readonly profile: string;
  readonly task?: string;
  readonly agent?: string;
  readonly model?: string;
  readonly status: "completed" | "failed" | "blocked";
  readonly exitCode?: number;
  readonly isContinuation?: boolean;
  readonly startedAt?: string;
  readonly endedAt?: string;
  readonly summary: {
    readonly task?: string;
    readonly result?: string;
    readonly accomplished?: string[];
    readonly pending?: string[];
  };
  readonly filesTouched?: readonly FileTouch[];
  readonly toolSummary?: readonly ToolSummary[];
  readonly finalOutput?: string;
  readonly artifacts: readonly { readonly path: string; readonly description: string }[];
  readonly blockContext?: {
    readonly reason: string;
    readonly triggeredBy?: string;
    readonly policyRule?: string;
    readonly suggestion?: string;
  };
}

// ---------------------------------------------------------------------------
// Rich markdown output
// ---------------------------------------------------------------------------

const STATUS_ICON: Record<HandoffBlock["status"], string> = {
  completed: "✅",
  failed: "❌",
  blocked: "🚫",
};

function table(rows: readonly (readonly [string, string])[]): string {
  const lines: string[] = [];
  lines.push("| Field | Value |");
  lines.push("|-------|-------|");
  for (const [field, value] of rows) {
    lines.push(`| ${field} | ${value} |`);
  }
  return lines.join("\n");
}

export async function writeHandoff(
  run: RunDirectory,
  block: HandoffBlock,
): Promise<string> {
  const sections: string[] = [];

  // ── Header ────────────────────────────────────────────────────────────
  sections.push("# Handoff", "");

  // ── Metadata table ────────────────────────────────────────────────────
  const metaRows: (readonly [string, string])[] = [
    ["Run ID", `\`${block.runId}\``],
    ["Profile", block.profile],
  ];
  if (block.task) {
    metaRows.push(["Task", block.task]);
  }
  if (block.agent) {
    metaRows.push(["Agent", block.agent]);
  }
  metaRows.push(
    ["Model", block.model ?? "(default)"],
    ["Status", `${STATUS_ICON[block.status]} ${block.status}`],
  );
  if (block.exitCode !== undefined) {
    metaRows.push(["Exit Code", String(block.exitCode)]);
  }
  if (block.isContinuation !== undefined) {
    metaRows.push(["Is Continuation", block.isContinuation ? "Yes" : "No"]);
  }
  if (block.startedAt) {
    metaRows.push(["Started", block.startedAt]);
  }
  if (block.endedAt) {
    metaRows.push(["Ended", block.endedAt]);
  }
  sections.push(table(metaRows), "");

  // ── Summary ───────────────────────────────────────────────────────────
  sections.push("## Summary", "");
  const s = block.summary;
  if (s.task) {
    sections.push("### Task", "", s.task, "");
  }
  if (s.result) {
    sections.push("### Result", "", s.result, "");
  }
  if (s.accomplished && s.accomplished.length > 0) {
    sections.push("### Accomplished", "", ...s.accomplished.map((a) => `- ${a}`), "");
  }
  if (s.pending && s.pending.length > 0) {
    sections.push("### Pending", "", ...s.pending.map((p) => `- ${p}`), "");
  }

  // ── Files Touched ─────────────────────────────────────────────────────
  if (block.filesTouched && block.filesTouched.length > 0) {
    const rows = [
      "## Files Touched",
      "",
      "| Operation | Path |",
      "|-----------|------|",
      ...block.filesTouched.map((f) => `| ${f.operation} | ${f.path} |`),
      "",
    ];
    sections.push(...rows);
  }

  // ── Tool Summary ──────────────────────────────────────────────────────
  if (block.toolSummary && block.toolSummary.length > 0) {
    const rows = [
      "## Tool Summary",
      "",
      "| Tool | Count |",
      "|------|-------|",
      ...block.toolSummary.map((t) => `| ${t.toolName} | ${t.count} |`),
      "",
    ];
    sections.push(...rows);
  }

  // ── Final Output ──────────────────────────────────────────────────────
  if (block.finalOutput) {
    sections.push("## Final Output", "", block.finalOutput, "");
  }

  // ── Artifacts ─────────────────────────────────────────────────────────
  sections.push("## Artifacts", "");
  for (const a of block.artifacts) {
    sections.push(`- \`${a.path}\` — ${a.description}`);
  }
  sections.push("");

  // ── Transcript (collapsible) ──────────────────────────────────────────
  if (block.finalOutput) {
    sections.push(
      "## Transcript",
      "",
      "<details>",
      `<summary>Full transcript (${block.finalOutput.length} chars)</summary>`,
      "",
      block.finalOutput,
      "",
      "</details>",
      "",
    );
  }

  // ── Block Context ─────────────────────────────────────────────────────
  if (block.blockContext && (block.status === "blocked" || block.status === "failed")) {
    sections.push("## Block Context", "");
    const bc = block.blockContext;
    const bcRows: (readonly [string, string])[] = [
      ["Reason", bc.reason],
    ];
    if (bc.triggeredBy) {
      bcRows.push(["Triggered By", bc.triggeredBy]);
    }
    if (bc.policyRule) {
      bcRows.push(["Policy Rule", bc.policyRule]);
    }
    if (bc.suggestion) {
      bcRows.push(["Suggestion", bc.suggestion]);
    }
    sections.push(table(bcRows), "");
  }

  // ── Timestamp ─────────────────────────────────────────────────────────
  sections.push(
    "---",
    "",
    `*Generated at ${new Date().toISOString()}*`,
  );

  const content = sections.join("\n");
  await writeFile(run.handoffPath, content, "utf-8");
  return run.handoffPath;
}
