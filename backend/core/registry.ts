/**
 * better-subagent -- In-Memory Registry
 *
 * Pure data structure holding all Entry objects with indexes for O(1) lookups.
 * No I/O, no side effects. Transient/persistent lifecycle is tracked via an
 * in-memory set of transient entry IDs.
 *
 * Loaded from disk at startup by `runtime/registry-store.ts`.
 *
 * @module
 */

import { createHash } from "node:crypto";
import type { Entry, EntryInput, AddMode } from "./types.ts";

// ---------------------------------------------------------------------------
// Entry ID generation
// ---------------------------------------------------------------------------

/**
 * Generate a content-addressed entry ID from a content string.
 *
 * Uses SHA-256 truncated to 16 hex characters (64 bits of entropy).
 * Deterministic: the same content string always produces the same ID,
 * enabling deduplication at the storage layer.
 */
export function generateEntryId(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex").slice(0, 16);
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * In-memory registry of Entry objects with multi-index support.
 *
 * # Lifecycle
 *
 * Entries can be:
 *   **Persistent** -- written to durable storage, survive restarts and agent
 *   handoffs. This is the default for `add()`.
 *   **Transient** -- exist only in the in-memory index for the current run.
 *   Lost when the process restarts. Useful for runtime observations, tool
 *   outputs, and auto-generated context.
 *
 * # Internal indexes
 *
 * | Index             | Key        | Value        | Lookup                     |
 * |-------------------|------------|--------------|----------------------------|
 * | `idIndex`         | id         | Entry        | `get(id)`                  |
 * | `nameIndex`       | name       | id           | `getByName(name)`          |
 * | `capabilityIndex` | capability | `Set<id>`    | `findByCapability(cap)`    |
 * | `tagIndex`        | tag        | `Set<id>`    | `findByTags(tags, mode)`   |
 * | `groupIndex`      | group      | `Set<id>`    | `findByGroup(group)`       |
 * | `transientIds`    | id         | (plain set)  | `listTransient()`          |
 *
 * # Serialization (data only, no I/O)
 *
 * - `exportPersistent()` / `exportTransient()` -- extract entries for
 *    downstream storage.
 * - `importPersistent(entries)` -- bulk-load persistent entries at startup.
 */
export class Registry {
  // -----------------------------------------------------------------------
  // Internal indexes
  // -----------------------------------------------------------------------

  /** Primary index: entry ID -> Entry. */
  private readonly idIndex = new Map<string, Entry>();

  /** Name -> entry ID (for `{{name}}` placeholder resolution). */
  private readonly nameIndex = new Map<string, string>();

  /** Capability name -> Set of entry IDs that satisfy it. */
  private readonly capabilityIndex = new Map<string, Set<string>>();

  /** Tag label -> Set of entry IDs carrying that tag. */
  private readonly tagIndex = new Map<string, Set<string>>();

  /** Group name -> Set of entry IDs in that group. */
  private readonly groupIndex = new Map<string, Set<string>>();

  /** Set of entry IDs that are transient (in-memory only). */
  private readonly transientIds = new Set<string>();

  /** Per-entry round counters for `rounds`-type lifecycle tracking. */
  private readonly roundCounters = new Map<string, number>();

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------

  constructor() {
    // All state initialised inline above.
  }

  // -----------------------------------------------------------------------
  // CRUD
  // -----------------------------------------------------------------------

  /**
   * Add an entry to the registry.
   *
   * - If `input.id` is empty or absent, an ID is generated from the entry's
   *   `content` field via `generateEntryId()`.
   * - If an entry with the same ID already exists, the call is **idempotent**
   *   and returns the existing ID without mutating state.
   * - When `mode` is `"transient"` the entry is marked as ephemeral and will
   *   NOT be included in `exportPersistent()`.
   *
   * @param input - Entry specification (all fields except `id` optional).
   * @param mode  - `"persistent"` (default) or `"transient"`.
   * @returns The resolved entry ID (existing or newly generated).
   */
  add(input: EntryInput, mode: AddMode = "persistent"): string {
    const id = input.id?.trim() || generateEntryId(input.content);

    // Idempotent: skip if entry with this ID already exists.
    if (this.idIndex.has(id)) return id;

    // Assemble the full Entry from the input, filling defaults for
    // fields that `EntryInput` makes optional.
    const entry: Entry = {
      id,
      name: input.name,
      version: input.version ?? 1,
      kind: input.kind,
      content: input.content,
      mimeType: input.mimeType ?? "text/markdown",
      description: input.description,
      capabilities: input.capabilities ?? [],
      depends: input.depends ?? [],
      conflicts: input.conflicts ?? [],
      estimatedTokens: input.estimatedTokens ?? 0,
      priority: input.priority ?? 50,
      lifecycle: input.lifecycle ?? { type: "permanent" },
      frequency: input.frequency ?? {},
      tags: input.tags ?? [],
      group: input.group ?? "",
    };

    this.indexEntry(entry);

    if (mode === "transient") {
      this.transientIds.add(id);
    }

    return id;
  }

  /**
   * Remove an entry from the registry and every index.
   *
   * Also cleans up the round counter if one existed for this entry.
   *
   * @param id - The entry ID to remove.
   * @returns `true` if the entry existed and was removed, `false` otherwise.
   */
  remove(id: string): boolean {
    const entry = this.idIndex.get(id);
    if (!entry) return false;

    this.unindexEntry(entry);
    this.transientIds.delete(id);
    this.roundCounters.delete(id);
    return true;
  }

  /**
   * Update mutable fields of an entry.
   *
   * Indexes are rebuilt for any indexed field that changed (name,
   * capabilities, tags, group). The entry's `id` is immutable and always
   * preserved.
   *
   * @param id      - The ID of the entry to update (must exist).
   * @param changes - A partial `Entry` with the fields to update.
   * @returns `true` if the entry was found and updated, `false` otherwise.
   */
  update(id: string, changes: Partial<Entry>): boolean {
    const old = this.idIndex.get(id);
    if (!old) return false;

    // Remove old index entries before mutating.
    this.unindexEntry(old);

    // Merge changes, forcing the original id.
    const updated: Entry = { ...old, ...changes, id };

    this.indexEntry(updated);
    return true;
  }

  /**
   * Retrieve an entry by ID.
   *
   * @param id - The entry ID.
   * @returns The `Entry` if found, `undefined` otherwise.
   */
  get(id: string): Entry | undefined {
    return this.idIndex.get(id);
  }

  /**
   * Look up an entry by its `name` field (used for `{{name}}` placeholder
   * resolution).
   *
   * @param name - The entry's `.name` value.
   * @returns The `Entry` if found, `undefined` otherwise.
   */
  getByName(name: string): Entry | undefined {
    const id = this.nameIndex.get(name);
    return id !== undefined ? this.idIndex.get(id) : undefined;
  }

  /**
   * Total number of entries currently in the registry (persistent +
   * transient).
   */
  get size(): number {
    return this.idIndex.size;
  }

  // -----------------------------------------------------------------------
  // Query
  // -----------------------------------------------------------------------

  /**
   * Find all entries that declare a specific capability.
   *
   * @param capability - The capability name to match.
   * @returns An array of matching `Entry` objects (empty if none).
   */
  findByCapability(capability: string): Entry[] {
    const ids = this.capabilityIndex.get(capability);
    if (!ids || ids.size === 0) return [];
    return this.resolveIds(ids);
  }

  /**
   * Find entries by tags.
   *
   * @param tags - Tag labels to search for.
   * @param mode - `"any"` returns entries matching at least one tag (union).
   *               `"all"` returns entries matching EVERY specified tag
   *               (intersection).
   * @returns An array of matching `Entry` objects (empty if none).
   */
  findByTags(tags: string[], mode: "any" | "all"): Entry[] {
    if (tags.length === 0) return [];

    const sets = tags
      .map((t) => this.tagIndex.get(t))
      .filter((s): s is Set<string> => s !== undefined);

    if (sets.length === 0) return [];

    if (mode === "all") {
      // Intersection -- IDs present in EVERY tag set.
      const result = new Set(sets[0]!);
      for (let i = 1; i < sets.length; i++) {
        const current = sets[i]!;
        for (const id of result) {
          if (!current.has(id)) result.delete(id);
        }
        if (result.size === 0) break;
      }
      return this.resolveIds(result);
    }

    // Union -- IDs present in ANY tag set.
    const result = new Set(sets[0]!);
    for (let i = 1; i < sets.length; i++) {
      for (const id of sets[i]!) {
        result.add(id);
      }
    }
    return this.resolveIds(result);
  }

  /**
   * Find all entries in a specific group.
   *
   * @param group - The group name.
   * @returns An array of matching `Entry` objects (empty if none).
   */
  findByGroup(group: string): Entry[] {
    const ids = this.groupIndex.get(group);
    if (!ids || ids.size === 0) return [];
    return this.resolveIds(ids);
  }

  /**
   * List every entry in the registry.
   */
  list(): Entry[] {
    return [...this.idIndex.values()];
  }

  /**
   * List all transient entries (in-memory only, not persisted).
   */
  listTransient(): Entry[] {
    return this.resolveIds(this.transientIds);
  }

  /**
   * List all persistent entries (survive restarts / process handoffs).
   *
   * Equivalent to: `list()` minus `listTransient()`.
   */
  listPersistent(): Entry[] {
    return [...this.idIndex.values()].filter(
      (e) => !this.transientIds.has(e.id),
    );
  }

  // -----------------------------------------------------------------------
  // Lifecycle tracking
  // -----------------------------------------------------------------------

  /**
   * Increment the per-entry round counter.
   *
   * Called by the runtime at the end of each conversation round so that
   * entries with `lifecycle: { type: "rounds", maxRounds }` can be expired
   * when their round budget is exhausted.
   *
   * @param id - The entry whose round counter should be advanced.
   */
  advanceRound(id: string): void {
    const current = this.roundCounters.get(id) ?? 0;
    this.roundCounters.set(id, current + 1);
  }

  /**
   * Get the number of rounds an entry has lived through.
   *
   * @param id - The entry ID.
   * @returns The round count (0 if never advanced or entry unknown).
   */
  getRoundCount(id: string): number {
    return this.roundCounters.get(id) ?? 0;
  }

  // -----------------------------------------------------------------------
  // Serialization (data only -- no I/O)
  // -----------------------------------------------------------------------

  /**
   * Export all persistent entries (suitable for encoding to JSONL).
   *
   * Transient entries are excluded from the result.
   */
  exportPersistent(): Entry[] {
    return [...this.idIndex.values()].filter(
      (e) => !this.transientIds.has(e.id),
    );
  }

  /**
   * Export all transient entries.
   */
  exportTransient(): Entry[] {
    return this.resolveIds(this.transientIds);
  }

  /**
   * Bulk-import persistent entries (e.g. deserialised from JSONL at
   * startup).
   *
   * - Entries with IDs that already exist are skipped (idempotent).
   * - Imported entries are explicitly marked persistent (removed from
   *   the transient set if they somehow carried that marker).
   *
   * @param entries - Array of fully-formed `Entry` objects to index.
   */
  importPersistent(entries: Entry[]): void {
    for (const entry of entries) {
      if (!this.idIndex.has(entry.id)) {
        this.indexEntry(entry);
      }
      // Imported entries are always persistent.
      this.transientIds.delete(entry.id);
    }
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /**
   * Add an entry to every in-memory index.
   */
  private indexEntry(entry: Entry): void {
    this.idIndex.set(entry.id, entry);

    // Name index
    this.nameIndex.set(entry.name, entry.id);

    // Capability index
    for (const cap of entry.capabilities) {
      let ids = this.capabilityIndex.get(cap);
      if (!ids) {
        ids = new Set();
        this.capabilityIndex.set(cap, ids);
      }
      ids.add(entry.id);
    }

    // Tag index
    for (const tag of entry.tags) {
      let ids = this.tagIndex.get(tag);
      if (!ids) {
        ids = new Set();
        this.tagIndex.set(tag, ids);
      }
      ids.add(entry.id);
    }

    // Group index (only non-empty groups are indexed)
    if (entry.group) {
      let ids = this.groupIndex.get(entry.group);
      if (!ids) {
        ids = new Set();
        this.groupIndex.set(entry.group, ids);
      }
      ids.add(entry.id);
    }
  }

  /**
   * Remove an entry from every in-memory index.
   *
   * Cleans up empty Set entries from secondary indexes to avoid memory
   * leaks from stale keys.
   */
  private unindexEntry(entry: Entry): void {
    this.idIndex.delete(entry.id);
    this.nameIndex.delete(entry.name);

    for (const cap of entry.capabilities) {
      const ids = this.capabilityIndex.get(cap);
      if (ids) {
        ids.delete(entry.id);
        if (ids.size === 0) this.capabilityIndex.delete(cap);
      }
    }

    for (const tag of entry.tags) {
      const ids = this.tagIndex.get(tag);
      if (ids) {
        ids.delete(entry.id);
        if (ids.size === 0) this.tagIndex.delete(tag);
      }
    }

    if (entry.group) {
      const ids = this.groupIndex.get(entry.group);
      if (ids) {
        ids.delete(entry.id);
        if (ids.size === 0) this.groupIndex.delete(entry.group);
      }
    }
  }

  /**
   * Resolve a collection of entry IDs to their `Entry` objects.
   *
   * IDs that no longer exist in `idIndex` (e.g. dangling index entries)
   * are silently filtered out.
   *
   * @param ids - An iterable of entry IDs.
   * @returns A (possibly empty) array of resolved `Entry` objects.
   */
  private resolveIds(ids: Iterable<string>): Entry[] {
    const result: Entry[] = [];
    for (const id of ids) {
      const entry = this.idIndex.get(id);
      if (entry) result.push(entry);
    }
    return result;
  }
}
