/**
 * runtime/output.ts — Handoff and transcript formatting.
 *
 * Pure formatting functions that produce the human-readable markdown
 * documents described in the handoff and transcript format specifications.
 * These functions do no I/O; they accept typed data and return strings.
 *
 * @module
 */

import type { Run } from "./run.ts";
import type { ContextAssembly } from "../core/types.ts";
import type { Event } from "../storage/event-log.ts";

// ---------------------------------------------------------------------------
// buildHandoff
// ---------------------------------------------------------------------------

/**
 * Build the handoff.md markdown document for a completed run.
 *
 * Produces a YAML-frontmatter document with a context assembly summary,
 * mounted/excluded entry tables, files touched, tool call summary, and
 * next-steps guidance.
 *
 * @param run       — Run metadata (id, profile, task, status, startTime, isContinuation).
 * @param events    — Ordered event log for the run.
 * @param assembly  — The context assembly produced by the pipeline.
 * @returns The formatted markdown string.
 */
export function buildHandoff(
  run: Run,
  events: Event[],
  assembly: ContextAssembly,
): string {
  const lines: string[] = [];

  // ---- YAML frontmatter ---------------------------------------------------
  lines.push("---");
  lines.push(`runId: ${run.id}`);
  lines.push(`profile: ${run.profile}`);
  lines.push(`task: ${run.task}`);
  lines.push(`status: ${run.status}`);
  lines.push(`startTime: ${run.startTime}`);
  lines.push(`isContinuation: ${String(run.isContinuation)}`);
  lines.push("---");
  lines.push("");

  // ---- Context Assembly Summary -------------------------------------------
  const m = assembly.metrics;
  lines.push("## Context Assembly Summary");
  lines.push("");
  lines.push(`- **Mounted**: ${m.mountedCount} entries (${m.totalTokens} tokens)`);
  lines.push(`- **Excluded**: ${m.excludedCount} entries`);
  lines.push(`- **Pool**: ${m.poolCount} available entries`);
  lines.push(`- **Budget Used**: ${m.budgetUsedPercent}%`);
  lines.push("");

  // ---- Mounted Entries ----------------------------------------------------
  const mounted = assembly.mounted;
  if (mounted.length > 0) {
    lines.push("## Mounted Entries");
    lines.push("");
    lines.push("| Name | Reason | Tokens | Capabilities |");
    lines.push("|------|--------|--------|-------------|");
    for (const me of mounted) {
      const caps = me.entry.capabilities?.join(", ") || "";
      lines.push(
        `| ${escapePipe(me.entry.name)} | ${me.reason} | ${me.tokens} | ${escapePipe(caps)} |`,
      );
    }
    lines.push("");
  }

  // ---- Excluded Entries ---------------------------------------------------
  const excluded = assembly.excluded;
  if (excluded.length > 0) {
    lines.push("## Excluded Entries");
    lines.push("");
    lines.push("| Name | Reason | Detail |");
    lines.push("|------|--------|--------|");
    for (const ee of excluded) {
      lines.push(
        `| ${escapePipe(ee.entry.name)} | ${ee.reason} | ${escapePipe(ee.detail)} |`,
      );
    }
    lines.push("");
  }

  // ---- Files Touched ------------------------------------------------------
  const filesTouched = extractFilesTouched(events);
  if (filesTouched.length > 0) {
    lines.push("## Files Touched");
    lines.push("");
    for (const ft of filesTouched) {
      lines.push(`- ${ft.path} (${ft.operation})`);
    }
    lines.push("");
  }

  // ---- Tool Call Summary --------------------------------------------------
  const toolSummary = extractToolSummary(events);
  if (toolSummary.length > 0) {
    lines.push("## Tool Call Summary");
    lines.push("");
    lines.push("| Tool | Count | Status |");
    lines.push("|------|-------|--------|");
    for (const ts of toolSummary) {
      lines.push(
        `| ${ts.toolName} | ${ts.total} | ${ts.succeeded} succeeded${ts.blocked > 0 ? `, ${ts.blocked} blocked` : ""} |`,
      );
    }
    lines.push("");
  }

  // ---- Block Context ------------------------------------------------------
  const blockCtx = extractBlockContext(events);
  if (blockCtx) {
    lines.push("## Block Context");
    lines.push("");
    lines.push(blockCtx);
    lines.push("");
  }

  // ---- Next Steps ---------------------------------------------------------
  lines.push("## Next Steps");
  lines.push("");
  if (run.status === "completed") {
    lines.push("No continuation required. Run completed successfully.");
  } else if (run.status === "timedout" || run.status === "failed") {
    lines.push(
      `The run exited with status "${run.status}". Consider reviewing the block context above, adjusting the profile or policy, and re-running.`,
    );
  } else {
    lines.push("Review the handoff document and determine next actions.");
  }
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// buildTranscript
// ---------------------------------------------------------------------------

/**
 * Build the transcript.md markdown document for a run.
 *
 * Produces a chronological event log with timestamps, tool calls (with
 * results or block indicators), and context mount/unmount notifications.
 *
 * @param run     — Run metadata (id, profile, task, startTime, status).
 * @param events  — Ordered event log for the run.
 * @returns The formatted markdown string.
 */
export function buildTranscript(
  run: Run,
  events: Event[],
): string {
  const lines: string[] = [];

  lines.push(`# Transcript: ${run.id}`);
  lines.push("");

  // Run Start
  const startTime = formatTimestamp(run.startTime);
  lines.push(`## Run Start (${startTime})`);
  lines.push(`Profile: ${run.profile}`);
  lines.push(`Task: ${run.task}`);
  lines.push("");

  // Event log section
  lines.push("## [Event Log]");
  lines.push("");

  for (const ev of events) {
    const t = formatHHMMSS(ev.timestamp);
    const type = ev.type;
    const d = ev.data;

    switch (type) {
      case "tool_call": {
        const toolName = String(d.tool ?? "unknown");
        const args = d.args as Record<string, unknown> | undefined;
        const argsStr = args ? formatArgs(args) : "";
        lines.push(`### ${t} Tool Call: ${toolName}(${argsStr})`);

        // Look ahead for the corresponding result or policy_block
        const resultLine = findActionResult(events, ev);
        if (resultLine) {
          lines.push(resultLine);
        }
        lines.push("");
        break;
      }

      case "tool_result": {
        // Already handled by the tool_call look-ahead.
        break;
      }

      case "policy_block": {
        const toolName = String(d.tool ?? "unknown");
        const reason = String(d.reason ?? "policy violation");
        lines.push(`### ${t} Tool Call: ${toolName}(...)`);
        lines.push(`→ BLOCKED: ${reason}`);
        lines.push("");
        break;
      }

      case "schedule":
      case "schedule_entries": {
        const name = extractScheduleName(ev);
        lines.push(`### ${t} Context Mounted: ${name}`);
        const reason = extractScheduleReason(ev);
        if (reason) lines.push(`Reason: ${reason}`);
        const tokens = d.tokens != null ? String(d.tokens) : undefined;
        if (tokens) lines.push(`${tokens}t`);
        lines.push("");
        break;
      }

      case "unschedule":
      case "unschedule_entries": {
        const name = extractScheduleName(ev);
        lines.push(`### ${t} Context Unmounted: ${name}`);
        lines.push("");
        break;
      }

      case "run_created":
      case "run_start": {
        lines.push(`### ${t} Run started (profile: ${d.profile ?? run.profile})`);
        lines.push("");
        break;
      }

      case "run_end": {
        lines.push(`### ${t} Run ended (status: ${d.status ?? run.status})`);
        lines.push("");
        break;
      }

      case "run_continue": {
        lines.push(`### ${t} Run continued`);
        lines.push("");
        break;
      }

      case "run_failed": {
        const err = d.error ? String(d.error) : "";
        lines.push(`### ${t} Run failed${err ? `: ${err}` : ""}`);
        lines.push("");
        break;
      }

      case "profile_loaded":
      case "prompt_composed":
        break; // internal, skip

      default: {
        // Render unknown events as JSON for debugging
        if (Object.keys(d).length > 0) {
          lines.push(`### ${t} ${type}`);
          lines.push("```json");
          lines.push(JSON.stringify(d, null, 2));
          lines.push("```");
          lines.push("");
        }
        break;
      }
    }
  }

  // Run End
  const endStatus = deriveEndStatus(events) ?? run.status;
  const endTime = formatTimestamp(run.startTime); // approximate
  lines.push(`## Run End (${endTime})`);
  lines.push(`Status: ${endStatus}`);
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Helper — files touched extraction
// ---------------------------------------------------------------------------

interface FileTouch {
  readonly path: string;
  readonly operation: string;
}

function extractFilesTouched(events: Event[]): FileTouch[] {
  const result: FileTouch[] = [];
  const seen = new Set<string>();

  for (const ev of events) {
    if (ev.type !== "tool_call") continue;
    const d = ev.data;
    const toolName = String(d.tool ?? "");
    const args = (d.args ?? {}) as Record<string, unknown>;
    const path = extractFilePath(toolName, args);
    if (!path) continue;

    const op = mapToolToOperation(toolName);
    const key = `${path}:${op}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ path, operation: op });
    }
  }

  return result;
}

function mapToolToOperation(tool: string): string {
  switch (tool) {
    case "write":  return "write";
    case "edit":   return "edit";
    case "delete": return "delete";
    case "bash":   return "bash";
    default:       return "read";
  }
}

function extractFilePath(
  tool: string,
  args: Record<string, unknown>,
): string | undefined {
  if (tool === "bash") {
    return typeof args.command === "string" ? args.command : undefined;
  }
  return (typeof args.path === "string" && args.path)
    || (typeof args.filePath === "string" && args.filePath)
    || undefined;
}

// ---------------------------------------------------------------------------
// Helper — tool call summary
// ---------------------------------------------------------------------------

interface ToolSummaryRow {
  readonly toolName: string;
  readonly total: number;
  readonly succeeded: number;
  readonly blocked: number;
}

function extractToolSummary(events: Event[]): ToolSummaryRow[] {
  const calls = new Map<string, number>();
  const blocks = new Map<string, number>();

  for (const ev of events) {
    const evt = ev.type;
    const d = ev.data;
    const toolName = String(d.tool ?? "");
    if (!toolName) continue;

    if (evt === "tool_call") {
      calls.set(toolName, (calls.get(toolName) ?? 0) + 1);
    } else if (evt === "policy_block") {
      blocks.set(toolName, (blocks.get(toolName) ?? 0) + 1);
    }
  }

  const allTools = new Set([...calls.keys(), ...blocks.keys()]);
  return Array.from(allTools)
    .sort()
    .map((toolName) => {
      const total = calls.get(toolName) ?? 0;
      const blocked = blocks.get(toolName) ?? 0;
      return { toolName, total, succeeded: total - blocked, blocked };
    });
}

// ---------------------------------------------------------------------------
// Helper — block context extraction
// ---------------------------------------------------------------------------

function extractBlockContext(events: Event[]): string | undefined {
  const blockLines: string[] = [];

  for (const ev of events) {
    if (ev.type !== "policy_block") continue;
    const d = ev.data;
    const tool = String(d.tool ?? "?");
    const reason = String(d.reason ?? "policy violation");
    blockLines.push(`- **${tool}**: ${reason}`);
  }

  if (blockLines.length === 0) return undefined;
  blockLines.unshift("Key decisions and blocking context from this run.");
  return blockLines.join("\n");
}

// ---------------------------------------------------------------------------
// Helper — transcript look-ahead for action result
// ---------------------------------------------------------------------------

/**
 * Find the result or block outcome immediately following a tool_call event.
 *
 * Returns a markdown line such as "→ [result]" or "→ BLOCKED: reason",
 * or undefined if no matching outcome is found.
 */
function findActionResult(events: Event[], callEv: Event): string | undefined {
  const callIdx = events.indexOf(callEv);
  if (callIdx < 0) return undefined;

  // Scan the next few events for a matching result or block.
  const limit = Math.min(callIdx + 10, events.length);
  for (let i = callIdx + 1; i < limit; i++) {
    const ev = events[i]!;
    const evt = ev.type;
    const d = ev.data;

    if (evt === "tool_result") {
      const output = String(d.output ?? "");
      const isError = d.isError === true;
      const snippet = isError
        ? `error: ${truncate(output, 120)}`
        : truncate(output, 120);
      return `→ ${snippet}`;
    }

    if (evt === "policy_block") {
      const reason = String(d.reason ?? "policy violation");
      return `→ BLOCKED: ${reason}`;
    }

    // If we hit another tool_call or run_end, stop — no matching result.
    if (evt === "tool_call" || evt === "run_end" || evt === "run_failed") {
      break;
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Helper — schedule event name extraction
// ---------------------------------------------------------------------------

function extractScheduleName(ev: Event): string {
  const d = ev.data;
  const tags = d.tags;
  if (Array.isArray(tags) && tags.length > 0) {
    return String(tags[0]);
  }
  const ids = d.ids || d.entryIds;
  if (Array.isArray(ids) && ids.length > 0) {
    return String(ids[0]);
  }
  const group = d.group;
  if (typeof group === "string" && group.length > 0) {
    return group;
  }
  return "unknown";
}

function extractScheduleReason(ev: Event): string | undefined {
  const d = ev.data;
  const scheduled = d.scheduled;
  if (typeof scheduled === "string") return scheduled;
  if (typeof d.removed === "number") return `removed ${d.removed}`;
  return undefined;
}

// ---------------------------------------------------------------------------
// Helper — end status derivation
// ---------------------------------------------------------------------------

function deriveEndStatus(events: Event[]): string | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]!;
    const d = ev.data;
    if (ev.type === "run_end" && typeof d.status === "string") {
      return d.status;
    }
    if (ev.type === "run_failed") {
      return "failed";
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Format an ISO timestamp to a human-readable local time string. */
function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return iso;
  }
}

/** Extract HH:MM:SS from an ISO 8601 timestamp. */
function formatHHMMSS(iso: string): string {
  try {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  } catch {
    return "--:--:--";
  }
}

/** Format tool call arguments as a compact string. */
function formatArgs(args: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, val] of Object.entries(args)) {
    if (typeof val === "string") {
      parts.push(`${key}: ${truncate(val, 60)}`);
    } else {
      parts.push(`${key}: ${JSON.stringify(val)}`);
    }
  }
  return parts.join(", ");
}

/** Truncate a string with an ellipsis if it exceeds maxLen. */
function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + "...";
}

/** Escape pipe characters for markdown table cells. */
function escapePipe(s: string): string {
  return s.replace(/\|/g, "\\|");
}
