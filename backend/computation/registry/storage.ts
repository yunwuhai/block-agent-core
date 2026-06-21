/**
 * Prompt Registry — Layer 1: Storage Engine
 *
 * JSONL-backed entry store with in-memory indexes for O(1) lookups.
 *
 * Storage files:
 *   registry.jsonl        — project-level, one JSON object per line, full rewrite on save
 *   registry-calls.jsonl  — per-run, append-only call history
 *
 * In-memory indexes (rebuilt on load):
 *   IdIndex    : Map<id, RegistryEntry>           — O(1) get(id)
 *   NameIndex  : Map<name, id>                    — O(1) getByName(name)
 *   TagIndex   : Map<tag, Set<id>>                — O(1) findByTags
 *   GroupIndex : Map<group, Set<id>>              — O(1) findByGroup
 *
 * SlidingWindowCounter per entry: three ring buffers (100/50/25) for call frequency.
 */

import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  RegistryEntry,
  CallRecord,
  SlidingWindowState,
  EntryType,
  LifecycleConfig,
  FrequencyConfig,
} from "./types.ts";

// ---------------------------------------------------------------------------
// SlidingWindowCounter
// ---------------------------------------------------------------------------

const WINDOW_SIZES = [100, 50, 25] as const;

/**
 * Per-entry sliding window counter for call frequency tracking.
 *
 * Three ring buffers store call timestamps. The buffer capacity equals the window
 * size; when full, the oldest timestamp is evicted (FIFO). `count()` returns the
 * number of calls currently stored (which equals the number of calls in the last
 * N calls — a pragmatic approximation of "calls per N rounds").
 */
class SlidingWindowCounter {
  private readonly buffers: Record<number, number[]>;
  private totalCalls = 0;

  constructor(state?: SlidingWindowState) {
    this.buffers = {
      100: state?.window100 ? [...state.window100] : [],
      50: state?.window50 ? [...state.window50] : [],
      25: state?.window25 ? [...state.window25] : [],
    };
    this.totalCalls = state?.totalCalls ?? 0;
  }

  /** Record a call. Timestamp is pushed to all three buffers. */
  record(timestamp: number): void {
    this.totalCalls++;
    for (const size of WINDOW_SIZES) {
      const buf = this.buffers[size]!;
      buf.push(timestamp);
      if (buf.length > size) buf.shift();
    }
  }

  /** Number of calls in the last `window` (25, 50, or 100). */
  count(window: number): number {
    return this.buffers[window]?.length ?? 0;
  }

  /** Lifetime total call count. */
  total(): number {
    return this.totalCalls;
  }

  /** Export state for persistence. */
  toState(): SlidingWindowState {
    return {
      window100: [...this.buffers[100]!],
      window50: [...this.buffers[50]!],
      window25: [...this.buffers[25]!],
      totalCalls: this.totalCalls,
    };
  }
}

// ---------------------------------------------------------------------------
// RegistryStorage
// ---------------------------------------------------------------------------

export class RegistryStorage {
  private readonly jsonlPath: string;
  private callsPath: string | null = null;

  // In-memory indexes
  private readonly idIndex = new Map<string, RegistryEntry>();
  private readonly nameIndex = new Map<string, string>(); // name → id
  private readonly tagIndex = new Map<string, Set<string>>(); // tag → Set<id>
  private readonly groupIndex = new Map<string, Set<string>>(); // group → Set<id>

  // Frequency counters (id → counter; lazy-init on first call)
  private readonly freqCounters = new Map<string, SlidingWindowCounter>();

  constructor(jsonlPath: string) {
    this.jsonlPath = jsonlPath;
  }

  // -----------------------------------------------------------------------
  // Persistence — load / save
  // -----------------------------------------------------------------------

  /**
   * Load all entries from registry.jsonl into memory, rebuilding all indexes.
   * If the file does not exist, initialises empty state (no error).
   */
  async load(): Promise<void> {
    this.clear();
    if (!existsSync(this.jsonlPath)) return;

    const raw = await readFile(this.jsonlPath, "utf-8");
    const lines = raw.trim().split("\n").filter(Boolean);

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as RegistryEntry;
        this.indexEntry(entry);
      } catch {
        // Skip malformed lines — best-effort load
      }
    }
  }

  /**
   * Save all entries to registry.jsonl (full rewrite).
   * Writes one JSON object per line with trailing newline.
   */
  async save(): Promise<void> {
    const lines: string[] = [];
    for (const entry of this.idIndex.values()) {
      lines.push(JSON.stringify(entry));
    }
    // Ensure trailing newline for valid JSONL format
    const content = lines.length > 0 ? lines.join("\n") + "\n" : "";
    await writeFile(this.jsonlPath, content, "utf-8");
  }

  // -----------------------------------------------------------------------
  // CRUD — register / unregister / get / update
  // -----------------------------------------------------------------------

  /**
   * Register a new entry. Generates a UUID, sets timestamps, and updates all
   * in-memory indexes. Does NOT deduplicate — use registerIfNew() when the
   * caller expects the same entry to be submitted across multiple runs.
   *
   * @returns The generated entry ID.
   */
  register(raw: Omit<RegistryEntry, "id" | "createdAt" | "updatedAt"> & {
    readonly tags?: readonly string[];
    readonly priority?: number;
    readonly lifecycle?: Partial<LifecycleConfig>;
  }): string {
    const now = Date.now();
    const id = randomUUID();

    const entry: RegistryEntry = {
      id,
      type: raw.type,
      description: raw.description,
      ...(raw.content !== undefined ? { content: raw.content } : {}),
      ...(raw.filePath !== undefined ? { filePath: raw.filePath } : {}),
      ...(raw.memberIds !== undefined ? { memberIds: raw.memberIds } : {}),
      ...(raw.name !== undefined ? { name: raw.name } : {}),
      tags: raw.tags ?? [],
      ...(raw.group !== undefined ? { group: raw.group } : {}),
      priority: raw.priority ?? 0,
      lifecycle: {
        type: raw.lifecycle?.type ?? "permanent",
        createdAt: now,
        ...(raw.lifecycle?.maxRounds !== undefined ? { maxRounds: raw.lifecycle.maxRounds } : {}),
        ...(raw.lifecycle?.validFrom !== undefined ? { validFrom: raw.lifecycle.validFrom } : {}),
        ...(raw.lifecycle?.validUntil !== undefined ? { validUntil: raw.lifecycle.validUntil } : {}),
      },
      ...(raw.frequency !== undefined ? { frequency: raw.frequency } : {}),
      createdBy: raw.createdBy,
      createdAt: now,
      updatedAt: now,
    };

    this.indexEntry(entry);
    return id;
  }

  /**
   * Register an entry only if an equivalent one does not already exist.
   *
   * Equivalence is determined by: type, description, content, filePath,
   * createdBy, and group. This prevents frontmatter-based entries from
   * being duplicated every time a new run re-processes the same profile.
   *
   * Hook-output entries (createdBy === "hook") are NEVER deduplicated —
   * each hook invocation produces a unique observation.
   *
   * @returns The existing entry's ID if deduplicated, or the new ID.
   */
  registerIfNew(raw: Omit<RegistryEntry, "id" | "createdAt" | "updatedAt"> & {
    readonly tags?: readonly string[];
    readonly priority?: number;
    readonly lifecycle?: Partial<LifecycleConfig>;
  }): string {
    // Hook entries are always unique — skip dedup
    if (raw.createdBy === "hook") {
      return this.register(raw);
    }

    // Search for an equivalent existing entry
    for (const existing of this.idIndex.values()) {
      if (
        existing.type === raw.type &&
        existing.description === raw.description &&
        (existing.content ?? "") === (raw.content ?? "") &&
        (existing.filePath ?? "") === (raw.filePath ?? "") &&
        existing.createdBy === raw.createdBy &&
        (existing.group ?? "") === (raw.group ?? "")
      ) {
        // Found a match — update tags/lifecycle if needed, return existing ID
        const needsUpdate =
          JSON.stringify(existing.tags) !== JSON.stringify(raw.tags ?? []) ||
          JSON.stringify(existing.lifecycle) !== JSON.stringify({
            type: raw.lifecycle?.type ?? "permanent",
            createdAt: existing.lifecycle.createdAt,
            ...(raw.lifecycle?.maxRounds !== undefined ? { maxRounds: raw.lifecycle.maxRounds } : {}),
          });
        if (needsUpdate) {
          this.update(existing.id, {
            tags: raw.tags ?? existing.tags,
            ...(raw.lifecycle !== undefined ? { lifecycle: { ...existing.lifecycle, ...raw.lifecycle } } : {}),
          });
        }
        return existing.id;
      }
    }

    return this.register(raw);
  }

  /**
   * Remove an entry by ID. Cleans up all indexes.
   * @returns true if the entry existed, false otherwise.
   */
  unregister(id: string): boolean {
    const entry = this.idIndex.get(id);
    if (!entry) return false;

    this.unindexEntry(entry);
    this.freqCounters.delete(id);
    return true;
  }

  /** Get an entry by ID. */
  get(id: string): RegistryEntry | undefined {
    return this.idIndex.get(id);
  }

  /** Get an entry bound to a `{{name}}` placeholder. */
  getByName(name: string): RegistryEntry | undefined {
    const id = this.nameIndex.get(name);
    if (id === undefined) return undefined;
    return this.idIndex.get(id);
  }

  /**
   * Update an entry's mutable fields. Updates indexes if tags/group/name change.
   * Does NOT change `id`, `createdBy`, or `createdAt`.
   */
  update(id: string, patch: Partial<Pick<RegistryEntry, "description" | "content" | "filePath" | "tags" | "group" | "priority" | "lifecycle" | "frequency" | "name" | "memberIds">>): boolean {
    const oldEntry = this.idIndex.get(id);
    if (!oldEntry) return false;

    // Remove old index entries
    this.unindexEntry(oldEntry);

    // Merge
    const updated: RegistryEntry = {
      ...oldEntry,
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.content !== undefined ? { content: patch.content } : {}),
      ...(patch.filePath !== undefined ? { filePath: patch.filePath } : {}),
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      tags: patch.tags ?? oldEntry.tags,
      ...(patch.group !== undefined ? { group: patch.group } : {}),
      ...(patch.memberIds !== undefined ? { memberIds: patch.memberIds } : {}),
      priority: patch.priority ?? oldEntry.priority,
      lifecycle: patch.lifecycle ? { ...oldEntry.lifecycle, ...patch.lifecycle } : oldEntry.lifecycle,
      ...(patch.frequency !== undefined ? { frequency: patch.frequency } : {}),
      updatedAt: Date.now(),
    };

    this.indexEntry(updated);
    return true;
  }

  // -----------------------------------------------------------------------
  // Tag management
  // -----------------------------------------------------------------------

  /** Add a tag to an existing entry. No-op if tag already present. */
  addTag(id: string, tag: string): boolean {
    const entry = this.idIndex.get(id);
    if (!entry) return false;
    if (entry.tags.includes(tag)) return true; // idempotent

    const newTags = [...entry.tags, tag];
    return this.update(id, { tags: newTags });
  }

  /** Remove a tag from an existing entry. No-op if tag not present. */
  removeTag(id: string, tag: string): boolean {
    const entry = this.idIndex.get(id);
    if (!entry) return false;
    if (!entry.tags.includes(tag)) return true; // idempotent

    const newTags = entry.tags.filter((t) => t !== tag);
    return this.update(id, { tags: newTags });
  }

  // -----------------------------------------------------------------------
  // Index queries
  // -----------------------------------------------------------------------

  /**
   * Find entries by tags.
   * @param match "any" — entries with at least one matching tag (default).
   *              "all" — entries with ALL specified tags.
   */
  findByTags(tags: readonly string[], match: "any" | "all" = "any"): RegistryEntry[] {
    if (tags.length === 0) return [];

    const idSets = tags
      .map((t) => this.tagIndex.get(t))
      .filter((s): s is Set<string> => s !== undefined);

    if (idSets.length === 0) return [];

    // Merge sets based on match mode
    const base = idSets[0]!;
    let resultSet: Set<string>;

    if (match === "all") {
      // Intersection: only IDs present in ALL tag sets
      resultSet = new Set(base);
      for (let i = 1; i < idSets.length; i++) {
        const current = idSets[i]!;
        for (const id of resultSet) {
          if (!current.has(id)) resultSet.delete(id);
        }
        if (resultSet.size === 0) break;
      }
    } else {
      // Union: IDs present in ANY tag set
      resultSet = new Set(base);
      for (let i = 1; i < idSets.length; i++) {
        for (const id of idSets[i]!) {
          resultSet.add(id);
        }
      }
    }

    return [...resultSet]
      .map((id) => this.idIndex.get(id))
      .filter((e): e is RegistryEntry => e !== undefined);
  }

  /** Find entries in a specific group. */
  findByGroup(group: string): RegistryEntry[] {
    const idSet = this.groupIndex.get(group);
    if (!idSet) return [];
    return [...idSet]
      .map((id) => this.idIndex.get(id))
      .filter((e): e is RegistryEntry => e !== undefined);
  }

  /**
   * List entries with optional filters.
   * @param filter.type — filter by entry type.
   * @param filter.group — filter by group.
   * @param filter.tags — filter by tags (any match).
   */
  list(filter?: { type?: EntryType; group?: string; tags?: readonly string[] }): RegistryEntry[] {
    let entries = [...this.idIndex.values()];

    if (filter?.type !== undefined) {
      entries = entries.filter((e) => e.type === filter.type);
    }
    if (filter?.group !== undefined) {
      entries = entries.filter((e) => e.group === filter.group);
    }
    if (filter?.tags !== undefined && filter.tags.length > 0) {
      const tagSet = new Set(filter.tags);
      entries = entries.filter((e) => e.tags.some((t) => tagSet.has(t)));
    }

    return entries;
  }

  /** Total number of registered entries. */
  get size(): number {
    return this.idIndex.size;
  }

  // -----------------------------------------------------------------------
  // Call history & frequency tracking
  // -----------------------------------------------------------------------

  /**
   * Set the per-run call history path. Must be called before recordCall().
   */
  setCallsPath(path: string): void {
    this.callsPath = path;
  }

  /**
   * Record a call for an entry. Appends to registry-calls.jsonl and
   * updates the in-memory sliding window counter.
   */
  async recordCall(record: CallRecord): Promise<void> {
    // Update in-memory counter
    let counter = this.freqCounters.get(record.entryId);
    if (!counter) {
      counter = new SlidingWindowCounter();
      this.freqCounters.set(record.entryId, counter);
    }
    counter.record(record.timestamp);

    // Persist to call history JSONL
    if (this.callsPath) {
      await mkdir(dirname(this.callsPath), { recursive: true });
      await appendFile(this.callsPath, JSON.stringify(record) + "\n", "utf-8");
    }
  }

  /**
   * Get call history records for an entry, optionally filtered by window size.
   * Reads from the per-run registry-calls.jsonl on disk.
   */
  async getCallHistory(entryId: string): Promise<CallRecord[]> {
    if (!this.callsPath || !existsSync(this.callsPath)) return [];
    const raw = await readFile(this.callsPath, "utf-8");
    return raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as CallRecord;
        } catch {
          return null;
        }
      })
      .filter((r): r is CallRecord => r !== null && r.entryId === entryId);
  }

  /**
   * Get the sliding window frequency for an entry.
   * @param window — 25, 50, or 100.
   */
  getFrequency(entryId: string, window: 25 | 50 | 100): number {
    const counter = this.freqCounters.get(entryId);
    if (!counter) return 0;
    return counter.count(window);
  }

  /** Get lifetime total call count for an entry. */
  getTotalCalls(entryId: string): number {
    const counter = this.freqCounters.get(entryId);
    if (!counter) return 0;
    return counter.total();
  }

  /**
   * Load frequency counters from a serialized state (used at run start when
   * continuing a session).
   */
  loadFreqState(state: Record<string, SlidingWindowState>): void {
    for (const [id, s] of Object.entries(state)) {
      this.freqCounters.set(id, new SlidingWindowCounter(s));
    }
  }

  /** Export all frequency counter states for persistence. */
  exportFreqState(): Record<string, SlidingWindowState> {
    const state: Record<string, SlidingWindowState> = {};
    for (const [id, counter] of this.freqCounters) {
      state[id] = counter.toState();
    }
    return state;
  }

  // -----------------------------------------------------------------------
  // Internal — index management
  // -----------------------------------------------------------------------

  /** Add an entry to all in-memory indexes. */
  private indexEntry(entry: RegistryEntry): void {
    // IdIndex
    this.idIndex.set(entry.id, entry);

    // NameIndex
    if (entry.name !== undefined) {
      this.nameIndex.set(entry.name, entry.id);
    }

    // TagIndex
    for (const tag of entry.tags) {
      let idSet = this.tagIndex.get(tag);
      if (!idSet) {
        idSet = new Set();
        this.tagIndex.set(tag, idSet);
      }
      idSet.add(entry.id);
    }

    // GroupIndex
    if (entry.group !== undefined) {
      let idSet = this.groupIndex.get(entry.group);
      if (!idSet) {
        idSet = new Set();
        this.groupIndex.set(entry.group, idSet);
      }
      idSet.add(entry.id);
    }
  }

  /** Remove an entry from all in-memory indexes. */
  private unindexEntry(entry: RegistryEntry): void {
    this.idIndex.delete(entry.id);

    if (entry.name !== undefined) {
      this.nameIndex.delete(entry.name);
    }

    for (const tag of entry.tags) {
      const idSet = this.tagIndex.get(tag);
      if (idSet) {
        idSet.delete(entry.id);
        if (idSet.size === 0) this.tagIndex.delete(tag);
      }
    }

    if (entry.group !== undefined) {
      const idSet = this.groupIndex.get(entry.group);
      if (idSet) {
        idSet.delete(entry.id);
        if (idSet.size === 0) this.groupIndex.delete(entry.group);
      }
    }
  }

  /** Wipe all state (indexes + counters). */
  private clear(): void {
    this.idIndex.clear();
    this.nameIndex.clear();
    this.tagIndex.clear();
    this.groupIndex.clear();
    this.freqCounters.clear();
  }
}
