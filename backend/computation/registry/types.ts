/**
 * Prompt Registry — Core Type Definitions
 *
 * Three-layer architecture:
 *   Layer 1 (Storage)  — JSONL-backed entry store with in-memory indexes
 *   Layer 2 (Resolution) — dedup, lifecycle filtering, frequency capping, sorting
 *   Layer 3 (Orchestration) — LLM-callable schedule tools, template expansion
 *
 * Message composition: ToC table (always) + injected entries (when scheduled) + context (dialogue)
 */

// ---------------------------------------------------------------------------
// Entry — the core unit stored in registry.jsonl
// ---------------------------------------------------------------------------

/** Discriminated union tag for entry source type. */
export type EntryType = "custom" | "file" | "template";

/**
 * Lifecycle determines *when* an entry is active (can be scheduled/injected).
 *
 * - permanent      : never expires
 * - rounds         : expires after `maxRounds` conversation rounds from `createdAt`
 * - time-window    : active only between `validFrom` and `validUntil`
 * - session        : expires when the current run ends (checked by runId match)
 */
export type LifecycleType = "permanent" | "rounds" | "time-window" | "session";

export interface LifecycleConfig {
  readonly type: LifecycleType;
  /** Required for "rounds" type — max rounds before expiry. */
  readonly maxRounds?: number;
  /** Required for "time-window" type — unix ms start (inclusive). */
  readonly validFrom?: number;
  /** Required for "time-window" type — unix ms end (exclusive). */
  readonly validUntil?: number;
  /** Unix ms when the entry was registered. Used by "rounds" and "session" types. */
  readonly createdAt: number;
}

/**
 * Frequency caps control how often an entry can be injected.
 *
 * All limits are checked per-entry; exceeding any single limit excludes the entry
 * from the current resolution pass. Limits are checked against `SlidingWindowCounter`
 * data persisted in the per-run `registry-calls.jsonl`.
 */
export interface FrequencyConfig {
  /** Hard cap — entry is permanently excluded once total calls reach this. */
  readonly maxTotal?: number;
  /** Max calls within the last 100 rounds. */
  readonly maxPer100?: number;
  /** Max calls within the last 50 rounds. */
  readonly maxPer50?: number;
  /** Max calls within the last 25 rounds. */
  readonly maxPer25?: number;
}

/**
 * A single prompt registry entry.
 *
 * For `type: "custom"` — user-created inline content or content loaded from `filePath` on demand.
 * For `type: "file"` — bound to `{{name}}` placeholder, content loaded from `filePath`.
 * For `type: "template"` — a reference to another template entry, expanded at schedule time.
 */
export interface RegistryEntry {
  /** Unique identifier (UUID v4). Generated on registration. */
  readonly id: string;
  /** Discriminates content source. */
  readonly type: EntryType;
  /**
   * Short description (≤ one sentence) displayed in the ToC table at message head.
   * Allows the LLM to decide which entries to schedule without loading full content.
   */
  readonly description: string;
  /** Inline prompt text. Mutually exclusive with `filePath`. */
  readonly content?: string;
  /** Absolute or relative path to the content file. Used for `custom` and `file` types. */
  readonly filePath?: string;
  /** For `type: "template"` — array of entry IDs this template expands to. */
  readonly memberIds?: readonly string[];
  /**
   * Binding name for `{{name}}` placeholder substitution in prompt body.
   * Only meaningful for `type: "file"` entries. When `renderPrompt()` encounters
   * `{{name}}` in the prompt, it resolves via `registry.getByName(name)`.
   */
  readonly name?: string;
  /** Tags for LLM-driven scheduling via `scheduleTags(["tag1", "tag2"])`. */
  readonly tags: readonly string[];
  /** Organizational bucket for batch operations (`scheduleGroup("policies")`). */
  readonly group?: string;
  /**
   * Ordering priority when multiple entries are injected together.
   * Higher = rendered first (closer to prompt start). Default: 0.
   */
  readonly priority: number;
  /** Lifecycle configuration — controls when the entry is active. */
  readonly lifecycle: LifecycleConfig;
  /** Frequency caps — controls how often the entry can be injected. */
  readonly frequency?: FrequencyConfig;
  /** Who created this entry (for audit/debugging). */
  readonly createdBy: "user" | "system";
  /** Unix ms when the entry was first registered. */
  readonly createdAt: number;
  /** Unix ms when the entry was last updated. */
  readonly updatedAt: number;
}

// ---------------------------------------------------------------------------
// Call history — per-run tracking in registry-calls.jsonl
// ---------------------------------------------------------------------------

/** How the entry was triggered for injection. */
export type CallTrigger = "tag" | "id" | "group" | "template";

/**
 * A single call record stored in the per-run registry-calls.jsonl.
 * Appended after each successful resolution + injection.
 */
export interface CallRecord {
  readonly entryId: string;
  readonly roundId: string;
  readonly timestamp: number;
  readonly trigger: CallTrigger;
}

// ---------------------------------------------------------------------------
// Schedule state — per-round mutable state managed by Layer 3
// ---------------------------------------------------------------------------

/**
 * Mutable schedule state for the current conversation round.
 * LLM builds this via orchestration tools; Resolution engine consumes it.
 */
export interface ScheduleState {
  /** Tags the LLM has scheduled — all entries with ANY of these tags are resolved. */
  readonly tags: ReadonlySet<string>;
  /** Specific entry IDs the LLM has scheduled directly. */
  readonly ids: ReadonlySet<string>;
  /** Groups the LLM has scheduled — all entries in these groups are resolved. */
  readonly groups: ReadonlySet<string>;
  /** Template IDs the LLM has scheduled — expanded to member IDs at resolution time. */
  readonly templates: ReadonlySet<string>;
}

// ---------------------------------------------------------------------------
// Resolution output — what Layer 2 returns to Layer 3/Composer
// ---------------------------------------------------------------------------

/**
 * A fully resolved entry ready for injection into the outgoing message.
 * `content` is the loaded full text (from file or inline).
 */
export interface ResolvedEntry {
  readonly entry: RegistryEntry;
  readonly content: string;
}

// ---------------------------------------------------------------------------
// Run context — passed from runner into resolution/orchestration
// ---------------------------------------------------------------------------

/** Minimal context needed for lifecycle and call-history tracking. */
export interface RunContext {
  readonly runId: string;
  readonly roundNumber: number;
  readonly cwd: string;
}

// ---------------------------------------------------------------------------
// Sliding window buffer data (used internally by Storage layer)
// ---------------------------------------------------------------------------

/** Raw sliding window state persisted alongside frequency counters. */
export interface SlidingWindowState {
  /** Timestamps of calls within the last 100 rounds. */
  readonly window100: readonly number[];
  /** Timestamps of calls within the last 50 rounds. */
  readonly window50: readonly number[];
  /** Timestamps of calls within the last 25 rounds. */
  readonly window25: readonly number[];
  /** Total call count (lifetime). */
  readonly totalCalls: number;
}
