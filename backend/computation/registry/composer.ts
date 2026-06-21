/**
 * Prompt Registry — Message Composer
 *
 * Builds the final message sent to the LLM by assembling three sections:
 *
 *   1. HEAD     — ToC table (always present): shows available entries with
 *                 ID, tags, and short description so the LLM can decide
 *                 what to schedule in subsequent rounds.
 *   2. INJECTED — Full content of currently scheduled entries, resolved by
 *                 Layer 2 (resolution engine), loaded from disk or inline.
 *   3. CONTEXT  — The base prompt with `{{name}}` placeholders replaced
 *                 by content from registry entries bound to that name.
 *
 * After composition, call history is recorded for every injected entry.
 */

import type { RunContext, ResolvedEntry } from "./types.ts";
import type { RegistryStorage } from "./storage.ts";
import type { ScheduleOrchestrator } from "./orchestration.ts";
import { resolveScheduled, isActive } from "./resolution.ts";

// ---------------------------------------------------------------------------
// Placeholder replacement
// ---------------------------------------------------------------------------

/** Matches `{{word_chars}}` — same as the existing PLACEHOLDER_RE in engine.ts. */
const PLACEHOLDER_RE = /\{\{([\w-]+)\}\}/g;

/**
 * Replace `{{name}}` patterns in `base` with content from registry entries.
 *
 * Resolution order:
 *   1. `getByName(name)` — explicit name binding (type: "file" entries)
 *   2. Unregistered `{{name}}` patterns are left as-is (safe degradation)
 *
 * Content sources (in priority order):
 *   a. `entry.content`  — inline prompt text
 *   b. `entry.filePath` — read from disk (custom / file entries)
 *
 * Missing/unreadable files emit a warning via a comment in the output
 * and leave the placeholder unchanged.
 */
async function replacePlaceholders(
  base: string,
  storage: RegistryStorage,
): Promise<string> {
  let resolved = base;
  const replacements: Array<{
    index: number;
    length: number;
    name: string;
    content: string;
  }> = [];

  for (const match of base.matchAll(PLACEHOLDER_RE)) {
    const name = match[1]!;
    const entry = storage.getByName(name);
    if (!entry) continue; // unregistered — keep as-is

    let content: string;
    if (entry.content !== undefined) {
      content = entry.content;
    } else if (entry.filePath !== undefined) {
      try {
        const { readFile } = await import("node:fs/promises");
        content = await readFile(entry.filePath, "utf-8");
      } catch {
        content = `[{{${name}}}: file not found — ${entry.filePath}]`;
      }
    } else {
      content = `[{{${name}}}: no content or filePath]`;
    }

    replacements.push({
      index: match.index!,
      length: match[0].length,
      name,
      content,
    });
  }

  // Apply in reverse order so indices stay valid
  replacements.sort((a, b) => b.index - a.index);
  for (const r of replacements) {
    resolved =
      resolved.slice(0, r.index) + r.content + resolved.slice(r.index + r.length);
  }

  return resolved;
}

// ---------------------------------------------------------------------------
// ToC table builder
// ---------------------------------------------------------------------------

/**
 * Build the "Table of Contents" markdown table for the message head.
 *
 * Includes all currently active (non-expired) registry entries.
 * Only shows ID, tags, and short description — never full content.
 * This lets the LLM decide which entries to schedule without burning
 * tokens on content it doesn't need.
 *
 * Format:
 *   ## Available Context
 *   | ID | Tags | Description |
 *   |----|------|-------------|
 *   | fs-policy | filesystem, security | 文件系统安全策略 |
 */
function buildToCTable(
  storage: RegistryStorage,
  runCtx?: RunContext,
  lifecycleMap?: ReadonlyMap<string, number>,
): string {
  const all = storage.list();
  const active = runCtx
    ? all.filter((e) => {
        const lifecycleRound = lifecycleMap?.get(e.id) ?? e.lifecycle.createdAt;
        return isActive(e, runCtx, lifecycleRound);
      })
    : all;

  if (active.length === 0) return "";

  const rows = active
    .map((e) => `| ${e.id} | ${e.tags.join(", ")} | ${e.description} |`)
    .join("\n");

  return `## Available Context\n| ID | Tags | Description |\n|----|------|-------------|\n${rows}`;
}

// ---------------------------------------------------------------------------
// Main compose function
// ---------------------------------------------------------------------------

export interface ComposeOptions {
  /** The raw prompt body with optional `{{name}}` placeholders. */
  basePrompt: string;
  /** Layer 3 orchestrator holding the current round's schedule. */
  orchestrator: ScheduleOrchestrator;
  /** Layer 1 storage for placeholder resolution. */
  storage: RegistryStorage;
  /** Current run context (round number, runId, cwd). */
  runCtx?: RunContext;
  /** Optional lifecycle round mapping. */
  lifecycleMap?: ReadonlyMap<string, number>;
}

/**
 * Compose the full message for the LLM.
 *
 * Returns a string with three sections:
 *   1. HEAD (ToC table)    — always present
 *   2. INJECTED (resolved) — present only when schedule is non-empty
 *   3. CONTEXT (prompt)    — basePrompt with `{{name}}` placeholders resolved
 *
 * Side effect: records call history for every injected entry via
 * `storage.recordCall()`.
 */
export async function composeMessage(options: ComposeOptions): Promise<string> {
  const { basePrompt, orchestrator, storage, runCtx, lifecycleMap } = options;

  // ---- 1. HEAD: ToC table (always) ----
  const toc = buildToCTable(storage, runCtx, lifecycleMap);

  // ---- 2. INJECTED: Scheduled entries ----
  let injected = "";
  if (runCtx) {
    const schedule = orchestrator.getSchedule();
    const resolved = await resolveScheduled(
      schedule,
      storage,
      runCtx,
      lifecycleMap,
    );

    if (resolved.length > 0) {
      const parts = resolved.map(
        (r: ResolvedEntry) => `[${r.entry.id}]\n${r.content}`,
      );
      injected = parts.join("\n\n");

      // Record call history for each injected entry
      const now = Date.now();
      const roundId = String(runCtx.roundNumber);
      for (const r of resolved) {
        await storage.recordCall({
          entryId: r.entry.id,
          roundId,
          timestamp: now,
          trigger: "tag", // best-effort; could refine per entry
        });
      }
    }
  }

  // ---- 3. CONTEXT: Placeholder-resolved prompt ----
  const context = await replacePlaceholders(basePrompt, storage);

  // ---- Assemble ----
  const sections = [toc, injected, context].filter((s) => s !== "");
  return sections.join("\n\n");
}

/** Re-export buildToCTable for standalone use (e.g., tests, debugging). */
export { buildToCTable };
