/**
 * Prompt Registry — Layer 2: Resolution Engine
 *
 * Consumes a ScheduleState from Layer 3 and resolves it into an ordered,
 * deduplicated list of `ResolvedEntry` objects ready for injection.
 *
 * Resolution pipeline:
 *   1. Collect  — tag lookup, id direct, group lookup, template expansion
 *   2. Dedup    — merge all sources, unique by entry ID
 *   3. Filter   — lifecycle check (isActive), frequency cap check
 *   4. Sort     — by priority descending, stable within same priority
 *   5. Load     — read filePath content or use inline content
 */

import { readFile } from "node:fs/promises";
import type {
  RegistryEntry,
  ScheduleState,
  ResolvedEntry,
  RunContext,
} from "./types.ts";
import type { RegistryStorage } from "./storage.ts";

// ---------------------------------------------------------------------------
// Lifecycle filter
// ---------------------------------------------------------------------------

/**
 * Check whether an entry is currently active based on its lifecycle config.
 *
 * - permanent   : always active
 * - rounds      : active if `roundNumber < entryLifecycleRound + maxRounds`
 *                 (entryLifecycleRound is derived from `createdAt` — see caller)
 * - time-window : active if `now` is within [validFrom, validUntil)
 * - session     : always returns true here — session-scoping is handled by
 *                 the caller (only loading entries for the current runId)
 */
export function isActive(entry: RegistryEntry, runCtx: RunContext, entryLifecycleRound: number): boolean {
  const lc = entry.lifecycle;

  switch (lc.type) {
    case "permanent":
      return true;

    case "rounds": {
      if (lc.maxRounds === undefined) return true; // safety: no cap set → active
      const elapsedRounds = runCtx.roundNumber - entryLifecycleRound;
      return elapsedRounds < lc.maxRounds;
    }

    case "time-window": {
      const now = Date.now();
      const from = lc.validFrom ?? 0;
      const until = lc.validUntil ?? Infinity;
      return now >= from && now < until;
    }

    case "session":
      // Session expiry is a caller concern (only entries created in this
      // run should be loaded — or all, depending on policy).
      return true;

    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// Frequency cap filter
// ---------------------------------------------------------------------------

/**
 * Check whether an entry has exceeded any of its frequency caps.
 * Returns true if the entry should be EXCLUDED (i.e. exceeded a cap).
 *
 * Caps checked (any exceeded → excluded):
 *   maxTotal  — lifetime call count
 *   maxPer100 — calls in last 100 rounds window
 *   maxPer50  — calls in last 50 rounds window
 *   maxPer25  — calls in last 25 rounds window
 */
export function exceedsFrequency(entry: RegistryEntry, storage: RegistryStorage): boolean {
  const freq = entry.frequency;
  if (!freq) return false;

  const total = storage.getTotalCalls(entry.id);

  if (freq.maxTotal !== undefined && total >= freq.maxTotal) return true;
  if (freq.maxPer100 !== undefined && storage.getFrequency(entry.id, 100) >= freq.maxPer100) return true;
  if (freq.maxPer50 !== undefined && storage.getFrequency(entry.id, 50) >= freq.maxPer50) return true;
  if (freq.maxPer25 !== undefined && storage.getFrequency(entry.id, 25) >= freq.maxPer25) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Template expansion
// ---------------------------------------------------------------------------

/**
 * Recursively expand a template entry into a flat list of member entry IDs.
 *
 * Templates can reference other templates — expansion is recursive with
 * cycle detection via a `visited` set. Entries that are NOT templates are
 * included directly. Missing entries are silently skipped.
 *
 * @param templateId — The ID of a `type: "template"` entry.
 * @param storage    — The registry to resolve IDs against.
 * @param visited    — Internal cycle-detection set (callers pass new Set()).
 * @returns Flat array of non-template entry IDs that the template expands to.
 */
export function expandTemplate(
  templateId: string,
  storage: RegistryStorage,
  visited: Set<string> = new Set(),
): string[] {
  if (visited.has(templateId)) return []; // cycle detected — stop
  visited.add(templateId);

  const entry = storage.get(templateId);
  if (!entry) return [];

  // If it's a template, expand its member IDs
  if (entry.type === "template" && entry.memberIds) {
    const result: string[] = [];
    for (const memberId of entry.memberIds) {
      const member = storage.get(memberId);
      if (!member) continue;

      if (member.type === "template") {
        // Recursive expansion
        result.push(...expandTemplate(memberId, storage, visited));
      } else {
        result.push(memberId);
      }
    }
    return result;
  }

  // Non-template entry referenced as "template" → include itself
  return [templateId];
}

// ---------------------------------------------------------------------------
// Content loading
// ---------------------------------------------------------------------------

/**
 * Load the full content for an entry.
 * - `content` field (inline): return as-is
 * - `filePath` field: read file from disk
 * - neither: empty string
 */
async function loadContent(entry: RegistryEntry): Promise<string> {
  if (entry.content !== undefined) return entry.content;
  if (entry.filePath !== undefined) {
    try {
      return await readFile(entry.filePath, "utf-8");
    } catch {
      return `[registry: failed to read ${entry.filePath}]`;
    }
  }
  return "";
}

// ---------------------------------------------------------------------------
// Main resolution pipeline
// ---------------------------------------------------------------------------

/**
 * Resolve a schedule into an ordered, deduplicated list of resolved entries.
 *
 * Pipeline:
 *   1. COLLECT — from tags, ids, groups, templates
 *   2. DEDUP   — unique by ID (same entry scheduled via multiple paths → once)
 *   3. FILTER  — lifecycle + frequency
 *   4. SORT    — priority descending
 *   5. LOAD    — read content (file or inline)
 *
 * @param schedule     — What the LLM scheduled via orchestration tools.
 * @param storage      — The Layer 1 registry store.
 * @param runCtx       — Current run context (round number, runId).
 * @param lifecycleMap — Optional map of entryId → round number when the entry
 *                        was created (for "rounds" lifecycle type). If not
 *                        provided, uses 0 (entry active immediately).
 */
export async function resolveScheduled(
  schedule: ScheduleState,
  storage: RegistryStorage,
  runCtx: RunContext,
  lifecycleMap?: ReadonlyMap<string, number>,
): Promise<ResolvedEntry[]> {
  // ---- 1. COLLECT ----

  const collected = new Map<string, RegistryEntry>();

  // Tags → entries
  if (schedule.tags.size > 0) {
    const tagEntries = storage.findByTags([...schedule.tags], "any");
    for (const e of tagEntries) {
      collected.set(e.id, e);
    }
  }

  // IDs → entries (direct)
  for (const id of schedule.ids) {
    const e = storage.get(id);
    if (e) collected.set(e.id, e);
  }

  // Groups → entries
  for (const group of schedule.groups) {
    const groupEntries = storage.findByGroup(group);
    for (const e of groupEntries) {
      collected.set(e.id, e);
    }
  }

  // Templates → expand → entries
  for (const templateId of schedule.templates) {
    const expandedIds = expandTemplate(templateId, storage);
    for (const id of expandedIds) {
      const e = storage.get(id);
      if (e) collected.set(e.id, e);
    }
  }

  // ---- 2. DEDUP (already handled by Map.set) ----

  // ---- 3. FILTER — lifecycle + frequency ----

  const filtered: RegistryEntry[] = [];
  for (const entry of collected.values()) {
    const lifecycleRound = lifecycleMap?.get(entry.id) ?? entry.lifecycle.createdAt;
    if (!isActive(entry, runCtx, lifecycleRound)) continue;
    if (exceedsFrequency(entry, storage)) continue;
    filtered.push(entry);
  }

  // ---- 4. SORT — priority descending, stable ----

  filtered.sort((a, b) => b.priority - a.priority);

  // ---- 5. LOAD — read content ----

  const resolved: ResolvedEntry[] = [];
  for (const entry of filtered) {
    const content = await loadContent(entry);
    resolved.push({ entry, content });
  }

  return resolved;
}
