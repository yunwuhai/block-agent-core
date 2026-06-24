/**
 * better-subagent — AssemblyPipeline
 *
 * =============================================================================
 * The heart of the assembly metaphor.
 *
 * PURE FUNCTION.  No I/O.  No side effects.  Deterministic (see note on
 * `time-window` lifecycle for the one permitted impurity).
 *
 *   ContextRequest + Registry + RunContext → ContextAssembly
 *
 * 6 steps, executed in order:
 *
 *   STEP 1 — COLLECT
 *     Gather candidate entries from ContextRequest.want (capabilities,
 *     explicit IDs, tags).  Build a deduplicated candidate set.
 *
 *   STEP 2 — RESOLVE DEPENDENCIES
 *     Recursively expand entry.depends for each candidate.  Track WHY each
 *     entry is being considered (original request vs. dependency expansion).
 *     Entries whose dependencies are missing are moved to the excluded list
 *     with reason "missing-dep".
 *
 *   STEP 3 — CHECK CONFLICTS
 *     For every pair of candidates, check entry.conflicts.  When a conflict
 *     is found, the lower-priority entry is excluded; at equal priorities,
 *     the later-collected entry is excluded.
 *
 *   STEP 4 — FILTER
 *     Remove entries that fail lifecycle checks or frequency caps.
 *
 *   STEP 5 — BUDGET ALLOCATE
 *     Sort candidates by priority (descending).  Pinned entries are mounted
 *     first (they bypass the budget, but are still checked for individual
 *     overflow).  Remaining entries are mounted in priority order until
 *     maxTokens or maxEntries is exhausted.
 *
 *   STEP 6 — LOAD CONTENT
 *     Set needsRead / needsGenerate flags on each mounted entry based on
 *     its `kind`.  Calculate actual token counts.  Build the final
 *     ContextAssembly.
 * =============================================================================
 */

import type {
  Entry,
  ContextRequest,
  ContextAssembly,
  MountedEntry,
  ExcludedEntry,
  PoolEntry,
  RunContext,
  MountReason,
  CallRecord,
} from "./types.ts";
import type { Registry } from "./registry.ts";

// ---------------------------------------------------------------------------
// Exported errors
// ---------------------------------------------------------------------------

/**
 * Thrown when a dependency chain exceeds MAX_DEPTH (10).
 */
export class CycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CycleError";
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Hard limit on recursive dependency expansion depth. */
const MAX_DEPTH = 10;

// ---------------------------------------------------------------------------
// Internal state — tracks entries as they flow through the pipeline
// ---------------------------------------------------------------------------

/**
 * Why a specific entry is being considered in the pipeline.
 * - `"request"`   : explicitly requested via capabilities / IDs / tags
 * - `"dependency"`: pulled in because another entry depends on it
 */
type InclusionReason = "request" | "dependency";

interface CandidateEntry {
  readonly entry: Entry;
  readonly reason: InclusionReason;
}

/**
 * Mutable state that accumulates candidates and exclusions across the
 * pipeline steps.  Each step reads from and writes to this structure.
 */
interface PipelineState {
  /** Entries still in the running (entryId → candidate). */
  candidates: Map<string, CandidateEntry>;

  /** Entries that have been definitively excluded (entryId → reason + detail). */
  excluded: Map<string, ExcludedEntry>;
}

// ---------------------------------------------------------------------------
// isActive — lifecycle check
// ---------------------------------------------------------------------------

/**
 * Determine whether an entry is active based on its lifecycle type and the
 * current run context.
 *
 * | Type          | Behaviour                                                   |
 * |---------------|-------------------------------------------------------------|
 * | `permanent`   | Always active.                                              |
 * | `rounds`      | Active while `currentRound <= maxRounds`.                   |
 * | `time-window` | Active while `now` is within the `[start, end)` interval.   |
 * | `session`     | Always active for the current run (scoped by caller).       |
 *
 * The only source of non-determinism in an otherwise pure pipeline:
 * when `context.currentTimestampMs` is omitted, `Date.now()` is used
 * as the reference time for `time-window` entries.
 */
export function isActive(entry: Entry, context: RunContext): boolean {
  const lc = entry.lifecycle;

  switch (lc.type) {
    case "permanent":
      return true;

    case "rounds":
      return context.currentRound <= lc.maxRounds;

    case "time-window": {
      const now = context.currentTimestampMs ?? Date.now();
      const start = new Date(lc.start).getTime();
      const end = new Date(lc.end).getTime();
      return now >= start && now < end;
    }

    case "session":
      // Session-scoped entries are always active for the current run.
      // The caller is responsible for not loading entries from other runs.
      return true;

    default:
      // Unknown lifecycle type — be permissive.
      return true;
  }
}

// ---------------------------------------------------------------------------
// Frequency-gate check
// ---------------------------------------------------------------------------

/**
 * Check whether an entry has exceeded any of its configured frequency caps.
 *
 * Returns `true` when the entry SHOULD BE EXCLUDED (i.e. a cap was hit).
 *
 * Caps checked (cumulative — any exceeded → excluded):
 *   - `maxTotal`   : lifetime call count
 *   - `maxPer100`  : calls within the most recent 100 distinct rounds
 *   - `maxPer50`   : calls within the most recent 50 distinct rounds
 *   - `maxPer25`   : calls within the most recent 25 distinct rounds
 *
 * When `entry.frequency` has no caps, this always returns `false`.
 *
 * @param entry   — The entry whose frequency gate to check.
 * @param records — All recorded call history for this entry, sorted
 *                  chronologically (newest or oldest — the function sorts
 *                  internally by timestamp descending).
 */
export function checkFrequency(
  entry: Entry,
  records: CallRecord[],
): boolean {
  const freq = entry.frequency;

  // No limits configured → always allowed.
  if (
    freq.maxTotal === undefined &&
    freq.maxPer100 === undefined &&
    freq.maxPer50 === undefined &&
    freq.maxPer25 === undefined
  ) {
    return false;
  }

  // ---- maxTotal: lifetime cap ----
  if (freq.maxTotal !== undefined && records.length >= freq.maxTotal) {
    return true;
  }

  // ---- Round-based sliding windows ----
  if (
    freq.maxPer100 === undefined &&
    freq.maxPer50 === undefined &&
    freq.maxPer25 === undefined
  ) {
    return false;
  }

  // Sort records by timestamp descending (newest first).
  const sorted = [...records].sort((a, b) => b.timestamp - a.timestamp);

  // Collect distinct round IDs in recency order.
  const uniqueRounds: string[] = [];
  const seen = new Set<string>();
  for (const r of sorted) {
    if (!seen.has(r.roundId)) {
      seen.add(r.roundId);
      uniqueRounds.push(r.roundId);
    }
  }

  /**
   * Count how many of the *sorted* records fall within the most recent `n`
   * distinct rounds.
   */
  function countInRecentRounds(n: number): number {
    const windowRounds = new Set(uniqueRounds.slice(0, n));
    let count = 0;
    for (const r of sorted) {
      if (windowRounds.has(r.roundId)) count++;
    }
    return count;
  }

  if (freq.maxPer100 !== undefined && countInRecentRounds(100) >= freq.maxPer100) {
    return true;
  }
  if (freq.maxPer50 !== undefined && countInRecentRounds(50) >= freq.maxPer50) {
    return true;
  }
  if (freq.maxPer25 !== undefined && countInRecentRounds(25) >= freq.maxPer25) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Dependency resolver (step 2)
// ---------------------------------------------------------------------------

/**
 * Recursively expand `entry.depends` for a given entry ID.
 *
 * Returns the entry itself followed by all its transitive dependencies.
 * The result is in traversal order (depth-first), and may contain an entry
 * multiple times if referenced from multiple paths — the caller deduplicates.
 *
 * @param entryId     — The entry to resolve dependencies for.
 * @param allEntries  — Every entry the pipeline knows about (keyed by ID).
 * @param visited     — Cycle-detection set (pass a fresh `Set` per root).
 * @param depth       — Current recursion depth (starts at 0).
 *
 * @throws {CycleError} when `depth > MAX_DEPTH`.
 */
function resolveDeps(
  entryId: string,
  allEntries: Map<string, Entry>,
  visited: Set<string>,
  depth: number,
): Entry[] {
  if (depth > MAX_DEPTH) {
    throw new CycleError(
      `Dependency chain exceeds max depth ${MAX_DEPTH} at entry "${entryId}"`,
    );
  }

  // Cycle detected — this branch yields nothing.
  if (visited.has(entryId)) {
    return [];
  }

  visited.add(entryId);

  const entry = allEntries.get(entryId);
  // Missing dependency — the caller will detect this via the depends list
  // and mark the root entry as excluded("missing-dep").
  if (!entry) {
    return [];
  }

  const deps = entry.depends.flatMap((depId) =>
    resolveDeps(depId, allEntries, new Set(visited), depth + 1),
  );

  return [entry, ...deps];
}

// ---------------------------------------------------------------------------
// Main pipeline — resolve
// ---------------------------------------------------------------------------

/**
 * Transform a `ContextRequest` into a `ContextAssembly` by running the
 * 6-step pipeline against the given `Registry` and `RunContext`.
 *
 * @param request        — What entries the caller wants.
 * @param registry       — Registry holding all known entries.
 * @param context        — Runtime context (round number, session, time).
 * @param frequencyState — Optional per-entry call history for frequency-gate
 *                         enforcement.  When omitted, frequency checks are
 *                         skipped (all entries pass).
 *
 * @returns A fully-resolved `ContextAssembly` with mounted entries, excluded
 *          entries, the pool of available entries, and aggregate metrics.
 */
export function resolve(
  request: ContextRequest,
  registry: Registry,
  context: RunContext,
  frequencyState?: Map<string, CallRecord[]>,
): ContextAssembly {
  const state: PipelineState = {
    candidates: new Map(),
    excluded: new Map(),
  };

  // =========================================================================
  // STEP 1 — COLLECT
  // =========================================================================

  // --- 1a. from capabilities ---
  if (request.want.capabilities) {
    for (const capName of request.want.capabilities) {
      const entries = registry.findByCapability(capName);
      if (entries.length === 0) {
        // Capability requested but no entries satisfy it.
        // We cannot add an ExcludedEntry because there is no entry to attach
        // the reason to.  The caller should inspect the assembly's mounted list
        // to verify requested capabilities were satisfied.
        // TODO: surface "not-found" diagnostics for empty capabilities
        //   via a future `warnings` or `unresolved` field on ContextAssembly.
      }
      for (const entry of entries) {
        state.candidates.set(entry.id, { entry, reason: "request" });
      }
    }
  }

  // --- 1b. from explicit entry IDs ---
  if (request.want.entryIds) {
    for (const id of request.want.entryIds) {
      const entry = registry.get(id);
      if (entry) {
        state.candidates.set(entry.id, { entry, reason: "request" });
      }
    }
  }

  // --- 1c. from tags ---
  if (request.want.tags && request.want.tags.length > 0) {
    const tagEntries = registry.findByTags([...request.want.tags], "any");
    for (const entry of tagEntries) {
      state.candidates.set(entry.id, { entry, reason: "request" });
    }
  }

  // =========================================================================
  // STEP 2 — RESOLVE DEPENDENCIES
  // =========================================================================

  // Build a complete map of every entry the pipeline can resolve against.
  // This includes candidates AND all registry entries, so that dependency
  // lookups can reach entries not directly in the candidate set.
  const allEntries = new Map<string, Entry>();
  for (const { entry } of state.candidates.values()) {
    allEntries.set(entry.id, entry);
  }
  for (const entry of registry.list()) {
    if (!allEntries.has(entry.id)) {
      allEntries.set(entry.id, entry);
    }
  }

  // Resolve deps for each candidate.  Track which candidates have errors.
  const resolvedDeps = new Map<string, Entry[]>();
  const erroredIds = new Set<string>();

  for (const [candidateId, { entry }] of state.candidates) {
    const visited = new Set<string>();
    try {
      const depChain = resolveDeps(candidateId, allEntries, visited, 0);
      resolvedDeps.set(candidateId, depChain);
    } catch (err) {
      if (err instanceof CycleError) {
        erroredIds.add(candidateId);
        state.candidates.delete(candidateId);
        state.excluded.set(candidateId, {
          entry,
          reason: "missing-dep",
          detail: err.message,
        });
      } else {
        throw err;
      }
    }
  }

  // Check for missing dependencies and add deps to candidates.
  for (const [candidateId, depChain] of resolvedDeps) {
    if (erroredIds.has(candidateId)) continue;

    const candidateEntry = allEntries.get(candidateId)!;

    // Check each declared dependency — if it is not in allEntries, exclude.
    const missing: string[] = [];
    for (const depId of candidateEntry.depends) {
      if (!allEntries.has(depId)) {
        missing.push(depId);
      }
    }

    if (missing.length > 0) {
      state.candidates.delete(candidateId);
      state.excluded.set(candidateId, {
        entry: candidateEntry,
        reason: "missing-dep",
        detail: `Required dependencies not found in registry: ${missing.join(", ")}`,
      });
      continue;
    }

    // Add all resolved dependency entries to the candidate set (if not
    // already present), tagged with "dependency" reason.
    for (const depEntry of depChain) {
      if (!state.candidates.has(depEntry.id)) {
        state.candidates.set(depEntry.id, {
          entry: depEntry,
          reason: "dependency",
        });
      }
    }
  }

  // =========================================================================
  // STEP 3 — CHECK CONFLICTS
  // =========================================================================

  // Collect current candidate IDs in insertion order.
  const candidateIds = [...state.candidates.keys()];

  for (let i = 0; i < candidateIds.length; i++) {
    const idA = candidateIds[i]!;
    const candidateA = state.candidates.get(idA);
    if (!candidateA) continue; // already excluded in a prior conflict check

    for (let j = i + 1; j < candidateIds.length; j++) {
      const idB = candidateIds[j]!;
      const candidateB = state.candidates.get(idB);
      if (!candidateB) continue; // already excluded in a prior conflict check

      const entryA = candidateA.entry;
      const entryB = candidateB.entry;

      const aConflictsB = entryA.conflicts.includes(idB);
      const bConflictsA = entryB.conflicts.includes(idA);

      if (!aConflictsB && !bConflictsA) continue;

      // A conflict exists — decide which entry to exclude.
      if (entryA.priority < entryB.priority) {
        // A has lower priority → exclude A.
        state.candidates.delete(idA);
        state.excluded.set(idA, {
          entry: entryA,
          reason: "conflict",
          detail: `Conflicts with "${idB}" (priority ${entryB.priority} > ${entryA.priority})`,
        });
      } else if (entryB.priority < entryA.priority) {
        // B has lower priority → exclude B.
        state.candidates.delete(idB);
        state.excluded.set(idB, {
          entry: entryB,
          reason: "conflict",
          detail: `Conflicts with "${idA}" (priority ${entryA.priority} > ${entryB.priority})`,
        });
      } else {
        // Equal priority — exclude the one collected later (higher index).
        state.candidates.delete(idB);
        state.excluded.set(idB, {
          entry: entryB,
          reason: "conflict",
          detail: `Conflicts with "${idA}" (same priority, "${idB}" collected later)`,
        });
      }
    }
  }

  // =========================================================================
  // STEP 4 — FILTER
  // =========================================================================

  for (const [id, candidate] of state.candidates) {
    const entry = candidate.entry;

    // --- 4a. Lifecycle check ---
    if (!isActive(entry, context)) {
      state.candidates.delete(id);
      state.excluded.set(id, {
        entry,
        reason: "lifecycle",
        detail: `Lifecycle type "${entry.lifecycle.type}" not active at round ${context.currentRound}`,
      });
      continue;
    }

    // --- 4b. Frequency check ---
    // Default is to enforce frequency (true).
    if (request.enforceFrequency !== false) {
      if (frequencyState !== undefined) {
        const records = frequencyState.get(id) ?? [];
        if (checkFrequency(entry, records)) {
          state.candidates.delete(id);
          state.excluded.set(id, {
            entry,
            reason: "frequency",
            detail: buildFrequencyDetail(entry),
          });
          continue;
        }
      }
    }
  }

  // =========================================================================
  // STEP 5 — BUDGET ALLOCATE
  // =========================================================================

  const maxTokens = request.budget?.maxTokens;
  const maxEntries = request.budget?.maxEntries;
  const pinnedSet = new Set(request.pinnedEntryIds ?? []);

  // Separate pinned and unpinned candidates.
  const pinned: CandidateEntry[] = [];
  const unpinned: CandidateEntry[] = [];

  for (const candidate of state.candidates.values()) {
    if (pinnedSet.has(candidate.entry.id)) {
      pinned.push(candidate);
    } else {
      unpinned.push(candidate);
    }
  }

  // Sort unpinned by priority descending.  Stable sort: entries with
  // the same priority retain their collection order.
  unpinned.sort((a, b) => b.entry.priority - a.entry.priority);

  const mounted: MountedEntry[] = [];
  let accumulatedTokens = 0;
  let mountedCount = 0;

  /**
   * Attempt to mount a candidate entry.
   *
   * Pinned entries bypass the budget constraints UNLESS their individual
   * estimated tokens exceed maxTokens (if set), in which case they are
   * excluded individually.
   *
   * Non-pinned entries are mounted only if both token and entry-count
   * budgets allow, and are otherwise excluded with reason "budget".
   *
   * @returns `true` if the entry was mounted, `false` if it was excluded.
   */
  function tryMount(
    cand: CandidateEntry,
    reason: MountReason,
    isPinned: boolean,
  ): boolean {
    const tokens = cand.entry.estimatedTokens;
    const id = cand.entry.id;

    // Pinned entries: only check individual overflow.
    if (isPinned) {
      if (maxTokens !== undefined && tokens > maxTokens) {
        state.excluded.set(id, {
          entry: cand.entry,
          reason: "budget",
          detail: `Pinned entry exceeds maxTokens individually (${tokens} > ${maxTokens})`,
        });
        return false;
      }
      // Pinned entries bypass accumulated budget — always mount.
    } else {
      // Non-pinned: check accumulated budget.
      if (maxTokens !== undefined && accumulatedTokens + tokens > maxTokens) {
        const remaining = maxTokens - accumulatedTokens;
        state.excluded.set(id, {
          entry: cand.entry,
          reason: "budget",
          detail:
            remaining > 0
              ? `Budget exceeded: needs ${tokens} tokens, only ${remaining} remaining`
              : `Token budget exhausted (${accumulatedTokens} / ${maxTokens})`,
        });
        return false;
      }
      if (maxEntries !== undefined && mountedCount >= maxEntries) {
        state.excluded.set(id, {
          entry: cand.entry,
          reason: "budget",
          detail: `Entry count limit reached (${maxEntries} max)`,
        });
        return false;
      }
    }

    mounted.push({
      entry: cand.entry,
      reason,
      tokens,
      needsRead: cand.entry.kind === "file",
      needsGenerate: cand.entry.kind === "generator",
    });
    accumulatedTokens += tokens;
    mountedCount++;
    return true;
  }

  // Mount pinned entries first.
  for (const candidate of pinned) {
    tryMount(candidate, "pinned", true);
  }

  // Mount unpinned entries in priority order.
  for (const candidate of unpinned) {
    const reason = resolveMountReason(candidate, request, registry);

    const wasMounted = tryMount(candidate, reason, false);
    if (wasMounted) {
      state.candidates.delete(candidate.entry.id);
    }
  }

  // =========================================================================
  // STEP 6 — LOAD CONTENT
  // =========================================================================

  // For "inline" entries the content is ready on entry.content.
  // For "file" entries the runtime layer must read from disk.
  // For "generator" entries the runtime layer must invoke the generator.
  // The needsRead / needsGenerate flags were already set during mounting.
  //
  // Actual token counting — the mounted entry carries the estimated tokens
  // from the entry; the runtime layer can refine this after loading content.

  // =========================================================================
  // ASSEMBLE OUTPUT
  // =========================================================================

  // Build the final ContextAssembly.
  const totalTokens = mounted.reduce((sum, m) => sum + m.tokens, 0);
  const budgetUsedPercent =
    maxTokens !== undefined && maxTokens > 0
      ? Math.round((totalTokens / maxTokens) * 100)
      : 0;

  // Pool = all registry entries not mounted and not excluded.
  const poolIds = new Set<string>();
  for (const entry of registry.list()) {
    if (
      !mounted.some((m) => m.entry.id === entry.id) &&
      !state.excluded.has(entry.id)
    ) {
      poolIds.add(entry.id);
    }
  }
  const pool: PoolEntry[] = [...poolIds].map((id) => ({
    entry: registry.get(id)!,
  }));

  return {
    mounted,
    excluded: [...state.excluded.values()],
    pool,
    metrics: {
      totalTokens,
      budgetUsedPercent,
      mountedCount: mounted.length,
      excludedCount: state.excluded.size,
      poolCount: pool.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Determine the `MountReason` for a candidate entry based on how it was
 * first requested and the original `ContextRequest`.
 */
function resolveMountReason(
  candidate: CandidateEntry,
  request: ContextRequest,
  registry: Registry,
): MountReason {
  // Dependency-triggered entries always get "dependency".
  if (candidate.reason === "dependency") {
    return "dependency";
  }

  const id = candidate.entry.id;

  // Check if this entry was matched via capabilities.
  if (request.want.capabilities) {
    for (const capName of request.want.capabilities) {
      const capEntries = registry.findByCapability(capName);
      if (capEntries.some((e) => e.id === id)) {
        return "capability";
      }
    }
  }

  // Check if this entry was matched via tags.
  if (request.want.tags && request.want.tags.length > 0) {
    const tagEntries = registry.findByTags([...request.want.tags], "any");
    if (tagEntries.some((e) => e.id === id)) {
      return "tag-match";
    }
  }

  // Fallback for direct entry IDs in the request.
  return "capability";
}

/**
 * Build a human-readable detail string for a frequency-gate exclusion.
 */
function buildFrequencyDetail(entry: Entry): string {
  const freq = entry.frequency;
  const parts: string[] = [];

  if (freq.maxTotal !== undefined) parts.push(`maxTotal=${freq.maxTotal}`);
  if (freq.maxPer100 !== undefined) parts.push(`maxPer100=${freq.maxPer100}`);
  if (freq.maxPer50 !== undefined) parts.push(`maxPer50=${freq.maxPer50}`);
  if (freq.maxPer25 !== undefined) parts.push(`maxPer25=${freq.maxPer25}`);

  return parts.length > 0
    ? `Frequency cap exceeded (${parts.join(", ")})`
    : "Frequency cap exceeded";
}
