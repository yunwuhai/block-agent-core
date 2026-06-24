/**
 * better-subagent -- RegistryStore
 *
 * JSONL persistence layer for the in-memory Registry.
 *
 * # File format (registry.jsonl)
 *
 * ```jsonl
 * {"id":"...","name":"...","version":1,"kind":"inline","content":"...","capabilities":["..."],...}
 * ```
 *
 * One JSON object per line. Each line is a complete {@link Entry}.
 *
 * # File format (registry-calls.jsonl)
 *
 * ```jsonl
 * {"entryId":"...","timestamp":"2026-06-23T10:00:00Z","round":3}
 * ```
 *
 * Append-only call log for frequency tracking.
 *
 * # File format (capabilities.jsonl)
 *
 * ```jsonl
 * {"name":"filesystem-read","description":"...","implies":["..."],"defaultEntryIds":["..."]}
 * ```
 *
 * # Atomic write protocol
 *
 * 1. Serialize all persistent entries to a single JSONL string.
 * 2. Write the string to `<file>.tmp`.
 * 3. Call `renameSync(<file>.tmp, <file>)`.
 *
 * This guarantees that the file on disk is either the complete old content
 * or the complete new content -- never a partial write.
 *
 * @module
 */

import { appendFile, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import type { Entry, Capability } from "../core/types.ts";
import { Registry } from "../core/registry.ts";
import { CapabilityRegistry } from "../core/capability.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single call record stored in registry-calls.jsonl.
 *
 * Unlike the pipeline-level {@link import("../core/types.ts").CallRecord}
 * (which uses numeric timestamps and string roundIds), this store-level
 * record uses ISO 8601 timestamps and numeric round counters for simpler
 * append-only logging.
 */
export interface CallRecord {
  /** The entry that was injected. */
  readonly entryId: string;
  /** ISO 8601 timestamp of the injection event. */
  readonly timestamp: string;
  /** Auto-incremented round counter scoped to this entry. */
  readonly round: number;
}

/**
 * Result of loading the registry from disk.
 */
export interface LoadResult {
  /** Reconstructed in-memory Registry with all persistent entries. */
  readonly registry: Registry;
  /** Parse errors encountered while reading the JSONL files. */
  readonly errors: readonly string[];
}

/**
 * Result of loading capabilities from disk.
 */
export interface CapabilityLoadResult {
  /** Reconstructed CapabilityRegistry with all declared capabilities. */
  readonly capabilities: CapabilityRegistry;
  /** Parse errors encountered while reading capabilities.jsonl. */
  readonly errors: readonly string[];
}

/**
 * Filesystem paths derived from a project working directory.
 */
export interface ProjectPaths {
  /** Base directory for all registry storage files. */
  readonly baseDir: string;
  /** Path to registry.jsonl (entry storage). */
  readonly registryPath: string;
  /** Path to registry-calls.jsonl (call history log). */
  readonly callsPath: string;
  /** Path to capabilities.jsonl (capability definitions). */
  readonly capabilitiesPath: string;
  /** Directory for run-specific artifacts. */
  readonly runsDir: string;
}

// ---------------------------------------------------------------------------
// Path utilities
// ---------------------------------------------------------------------------

/**
 * Derive standard storage paths from a project's working directory.
 *
 * Convention:
 * ```
 * <cwd>/.subagent/
 *   registry.jsonl
 *   registry-calls.jsonl
 *   capabilities.jsonl
 *   runs/
 * ```
 *
 * @param cwd - The project working directory (typically `process.cwd()` or
 *   the runtime's configured working directory).
 * @returns A {@link ProjectPaths} struct with all derived paths.
 */
export function createProjectPaths(cwd: string): ProjectPaths {
  const baseDir = join(cwd, ".subagent");
  return {
    baseDir,
    registryPath: join(baseDir, "registry.jsonl"),
    callsPath: join(baseDir, "registry-calls.jsonl"),
    capabilitiesPath: join(baseDir, "capabilities.jsonl"),
    runsDir: join(baseDir, "runs"),
  };
}

// ---------------------------------------------------------------------------
// RegistryStore
// ---------------------------------------------------------------------------

/**
 * JSONL persistence layer for the in-memory Registry.
 *
 * Manages three files:
 *
 * | File                 | Content                      | Write strategy     |
 * |----------------------|------------------------------|--------------------|
 * | `registry.jsonl`     | Entry objects (persistent)   | Atomic full-rewrite|
 * | `registry-calls.jsonl` | Call records (frequency)   | Append-only        |
 * | `capabilities.jsonl` | Capability definitions       | Atomic full-rewrite|
 *
 * Transient entries (in-memory only) are excluded from save().
 *
 * @example
 * ```ts
 * const paths = createProjectPaths("/home/user/project");
 * const store = new RegistryStore(paths.baseDir);
 *
 * const { registry, errors } = await store.load();
 * registry.add({ name: "my-entry", kind: "inline", content: "Hello", description: "..." });
 *
 * await store.save(registry);
 * await store.appendCallLog(entryId, new Date().toISOString());
 * ```
 */
export class RegistryStore {
  private readonly registryPath: string;
  private readonly callsPath: string;
  private readonly capabilitiesPath: string;

  /**
   * Per-entry round counters, auto-incremented on each `appendCallLog()`
   * call.  Restored from existing call history during `load()`.
   */
  private readonly roundCounters = new Map<string, number>();

  /**
   * @param basePath - Directory containing the registry JSONL files.
   *   Typically the `baseDir` from {@link createProjectPaths}.
   */
  constructor(basePath: string) {
    this.registryPath = join(basePath, "registry.jsonl");
    this.callsPath = join(basePath, "registry-calls.jsonl");
    this.capabilitiesPath = join(basePath, "capabilities.jsonl");
  }

  // -----------------------------------------------------------------------
  // Registry -- load / save
  // -----------------------------------------------------------------------

  /**
   * Load the registry and call history from disk.
   *
   * 1. Reads **registry.jsonl**, parses each line as an {@link Entry}, and
   *    bulk-imports them into a new {@link Registry} (all entries are marked
   *    persistent).
   * 2. Reads **registry-calls.jsonl** and rebuilds the internal round
   *    counters used by `appendCallLog()`.
   *
   * Malformed lines are silently skipped and recorded in the `errors` array;
   * the load never fails for individual parse errors.
   *
   * If a file does not exist, it is treated as empty (no error, empty
   * `errors` array).
   */
  async load(): Promise<LoadResult> {
    const errors: string[] = [];
    const registry = new Registry();

    // -- Load entries -------------------------------------------------------
    if (existsSync(this.registryPath)) {
      const raw = await readFile(this.registryPath, "utf-8");
      const lines = raw.split("\n").filter(Boolean);
      const entries: Entry[] = [];

      for (let i = 0; i < lines.length; i++) {
        try {
          entries.push(JSON.parse(lines[i]!) as Entry);
        } catch (e) {
          errors.push(
            `registry.jsonl line ${i + 1}: ${(e as Error).message}`,
          );
        }
      }

      registry.importPersistent(entries);
    }

    // -- Load call history and rebuild round counters -----------------------
    if (existsSync(this.callsPath)) {
      const raw = await readFile(this.callsPath, "utf-8");
      const lines = raw.split("\n").filter(Boolean);

      for (let i = 0; i < lines.length; i++) {
        try {
          const record = JSON.parse(lines[i]!) as CallRecord;
          const current = this.roundCounters.get(record.entryId) ?? 0;
          if (record.round > current) {
            this.roundCounters.set(record.entryId, record.round);
          }
        } catch (e) {
          errors.push(
            `registry-calls.jsonl line ${i + 1}: ${(e as Error).message}`,
          );
        }
      }
    }

    return { registry, errors };
  }

  /**
   * Save all **persistent** entries to registry.jsonl.
   *
   * Uses the atomic write protocol:
   *   1. Serialize entries to JSONL string.
   *   2. Write to `registry.jsonl.tmp`.
   *   3. Atomic rename (`.tmp` -> `.jsonl`).
   *
   * Transient entries (returned by `Registry.listTransient()`) are NOT
   * written to disk.
   *
   * The parent directory is created if it does not exist.
   *
   * @param registry - The in-memory registry to persist.
   */
  async save(registry: Registry): Promise<void> {
    const entries = registry.exportPersistent();
    const lines = entries.map((e) => JSON.stringify(e));
    const content = lines.length > 0 ? lines.join("\n") + "\n" : "";

    await mkdir(dirname(this.registryPath), { recursive: true });

    const tmpPath = this.registryPath + ".tmp";
    await writeFile(tmpPath, content, "utf-8");
    renameSync(tmpPath, this.registryPath);
  }

  // -----------------------------------------------------------------------
  // Call log -- append / load
  // -----------------------------------------------------------------------

  /**
   * Append one call record to registry-calls.jsonl.
   *
   * The `round` field is auto-incremented per entryId: the first call for
   * an entry is round 1, the second is round 2, etc.  Round numbers are
   * maintained in memory across loads (restored from existing call history
   * during `load()`).
   *
   * The parent directory is created if it does not exist.
   *
   * @param entryId - The entry that was injected.
   * @param timestamp - ISO 8601 timestamp of the injection event.
   */
  async appendCallLog(entryId: string, timestamp: string): Promise<void> {
    const prevRound = this.roundCounters.get(entryId) ?? 0;
    const round = prevRound + 1;
    this.roundCounters.set(entryId, round);

    const record: CallRecord = { entryId, timestamp, round };

    await mkdir(dirname(this.callsPath), { recursive: true });
    await appendFile(this.callsPath, JSON.stringify(record) + "\n", "utf-8");
  }

  /**
   * Load the complete call history grouped by entry ID.
   *
   * Reads every line from `registry-calls.jsonl` and returns them as a
   * `Map<entryId, CallRecord[]>`.  Malformed lines are silently skipped.
   *
   * If the file does not exist, an empty Map is returned.
   */
  async loadFrequencyState(): Promise<Map<string, CallRecord[]>> {
    const state = new Map<string, CallRecord[]>();

    if (!existsSync(this.callsPath)) return state;

    const raw = await readFile(this.callsPath, "utf-8");
    const lines = raw.split("\n").filter(Boolean);

    for (const line of lines) {
      try {
        const record = JSON.parse(line) as CallRecord;
        let records = state.get(record.entryId);
        if (!records) {
          records = [];
          state.set(record.entryId, records);
        }
        records.push(record);
      } catch {
        // Malformed line -- skip silently
      }
    }

    return state;
  }

  // -----------------------------------------------------------------------
  // Capabilities -- load / save
  // -----------------------------------------------------------------------

  /**
   * Save all capability definitions to capabilities.jsonl.
   *
   * Uses the same atomic write protocol as save():
   *   1. Serialize capabilities to JSONL string.
   *   2. Write to `capabilities.jsonl.tmp`.
   *   3. Atomic rename (`.tmp` -> `.jsonl`).
   *
   * The parent directory is created if it does not exist.
   *
   * @param registry - The CapabilityRegistry to persist.
   */
  async saveCapabilities(registry: CapabilityRegistry): Promise<void> {
    const capabilities = registry.list();
    const lines = capabilities.map((c) => JSON.stringify(c));
    const content = lines.length > 0 ? lines.join("\n") + "\n" : "";

    await mkdir(dirname(this.capabilitiesPath), { recursive: true });

    const tmpPath = this.capabilitiesPath + ".tmp";
    await writeFile(tmpPath, content, "utf-8");
    renameSync(tmpPath, this.capabilitiesPath);
  }

  /**
   * Load capability definitions from capabilities.jsonl.
   *
   * Each line is parsed as a {@link Capability} and declared on a fresh
   * {@link CapabilityRegistry}.  Malformed lines are recorded in the
   * `errors` array; the load never fails for individual parse errors.
   *
   * If the file does not exist, an empty registry is returned (no error,
   * empty `errors` array).
   */
  async loadCapabilities(): Promise<CapabilityLoadResult> {
    const errors: string[] = [];
    const capabilities = new CapabilityRegistry();

    if (!existsSync(this.capabilitiesPath)) {
      return { capabilities, errors };
    }

    const raw = await readFile(this.capabilitiesPath, "utf-8");
    const lines = raw.split("\n").filter(Boolean);

    for (let i = 0; i < lines.length; i++) {
      try {
        const cap = JSON.parse(lines[i]!) as Capability;
        capabilities.declare(cap);
      } catch (e) {
        errors.push(
          `capabilities.jsonl line ${i + 1}: ${(e as Error).message}`,
        );
      }
    }

    return { capabilities, errors };
  }
}
