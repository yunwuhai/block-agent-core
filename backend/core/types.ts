/**
 * better-subagent — Core Type Definitions
 *
 * =============================================================================
 *  Single source of truth for the assembly pipeline.
 *  All other modules import type definitions from here.  No I/O, pure types.
 * =============================================================================
 *
 * # Assembly Metaphor
 *
 * Entries are the fundamental units of context, analogous to source files in a
 * build system. The pipeline *assembles* a ContextAssembly by *mounting* entries
 * that match the caller's ContextRequest.  Mounted entries form the final prompt;
 * excluded entries are returned with rejection reasons so callers can diagnose
 * why something was not included.
 *
 * # Pipeline Stages
 *
 *   Request          Resolution            Composition            FinalPrompt
 *   (what)     =>    (which, why)     =>    (how)             =>  (output)
 *                    ┌──────────────┐       ┌──────────────┐
 *                    │ match caps   │       │ merge        │
 *                    │ check lc/freq│       │ tokenize     │
 *                    │ resolve deps │       │ format       │
 *                    │ detect confl │       └──────────────┘
 *                    └──────────────┘
 */

// ---------------------------------------------------------------------------
// 1. Entry — the fundamental unit
// ---------------------------------------------------------------------------

/** Discriminated union for how an entry's `content` field is interpreted. */
export type EntryKind = "inline" | "file" | "generator";

/**
 * When an entry is active and eligible for mounting.
 *
 * - `permanent`   : always active, never expires.
 * - `rounds`      : active for `maxRounds` conversation rounds from creation.
 * - `time-window` : active only between two ISO 8601 date strings.
 * - `session`     : active only for the current run, discarded on restart.
 */
export type Lifecycle =
  | { readonly type: "permanent" }
  | { readonly type: "rounds"; readonly maxRounds: number }
  | { readonly type: "time-window"; readonly start: string; readonly end: string }
  | { readonly type: "session" };

/**
 * Frequency gate — limits how often an entry can be injected.
 *
 * All limits are cumulative: exceeding ANY single cap excludes the entry
 * from the current assembly pass.  An undefined limit is not checked.
 */
export interface FrequencyGate {
  /** Hard lifetime cap — permanently excluded once total injections reach this. */
  readonly maxTotal?: number;
  /** Max injections in the last 100 rounds. */
  readonly maxPer100?: number;
  /** Max injections in the last 50 rounds. */
  readonly maxPer50?: number;
  /** Max injections in the last 25 rounds. */
  readonly maxPer25?: number;
}

/**
 * The fundamental unit of context.
 *
 * Each entry represents one piece of content that can be mounted into the
 * context assembly.  The `id` is a content-addressed hash of the entry's
 * payload so the same content always produces the same id (dedup at the
 * storage layer relies on this).
 *
 * @example
 * ```ts
 * const entry: Entry = {
 *   id: "sha256-abc123...",
 *   name: "fs-policy",
 *   version: 3,
 *   kind: "inline",
 *   content: "You may read files under /home/project/src/",
 *   mimeType: "text/markdown",
 *   description: "Filesystem read policy for the project",
 *   capabilities: ["filesystem-read"],
 *   depends: [],
 *   conflicts: ["fs-policy-strict"],
 *   estimatedTokens: 45,
 *   priority: 80,
 *   lifecycle: { type: "permanent" },
 *   frequency: { maxPer100: 5 },
 *   tags: ["policy", "filesystem", "security"],
 *   group: "policies",
 * };
 * ```
 */
export interface Entry {
  /**
   * Content-addressed hash (e.g. SHA-256 hex).
   * Uniquely identifies the entry across all runs and sessions.
   * Two entries with identical content/metadata produce the same id.
   */
  readonly id: string;

  /** Human-readable name used for `{{name}}` placeholder resolution. */
  readonly name: string;

  /** Monotonically increasing version number.  Bumps on every content change. */
  readonly version: number;

  /** Discriminates how the `content` field is interpreted. */
  readonly kind: EntryKind;

  /**
   * Entry payload, interpreted by `kind`:
   * - `"inline"`    : raw text (the literal content).
   * - `"file"`      : file path (absolute, or relative to project root).
   * - `"generator"` : generator / transformer ID resolved at assembly time.
   */
  readonly content: string;

  /** MIME type of the content.  Defaults to `"text/markdown"`. */
  readonly mimeType: string;

  /** One-line summary displayed in the table of contents. */
  readonly description: string;

  /** Capability names this entry satisfies. */
  readonly capabilities: readonly string[];

  /** Entry IDs that must be mounted before this one (dependency ordering). */
  readonly depends: readonly string[];

  /** Entry IDs that are mutually exclusive with this entry. */
  readonly conflicts: readonly string[];

  /**
   * Estimated token count of this entry's content.
   * Used for budget calculations before the content is loaded.
   */
  readonly estimatedTokens: number;

  /**
   * Mounting priority (0–100).
   * Lower values are more likely to be cut when the assembly exceeds budget.
   * Among mounted entries, higher priority renders closer to the prompt start.
   */
  readonly priority: number;

  /** Lifecycle — controls when this entry is active. */
  readonly lifecycle: Lifecycle;

  /** Frequency gate — controls how often this entry may be injected. */
  readonly frequency: FrequencyGate;

  /** Arbitrary tags for grouping and tag-based lookup. */
  readonly tags: readonly string[];

  /** Organizational group name for batch operations (e.g. `scheduleGroup("policies")`). */
  readonly group: string;
}

// ---------------------------------------------------------------------------
// 2. EntryInput — what callers provide when adding entries
// ---------------------------------------------------------------------------

/**
 * Input shape for adding an entry to the registry.
 *
 * Mirrors `Entry` but `id` and `version` are optional (auto-generated),
 * and most other fields have sensible defaults:
 *
 * | Field             | Default               |
 * |-------------------|-----------------------|
 * | `id`              | auto from hash        |
 * | `version`         | `1`                   |
 * | `mimeType`        | `"text/markdown"`     |
 * | `capabilities`    | `[]`                  |
 * | `depends`         | `[]`                  |
 * | `conflicts`       | `[]`                  |
 * | `estimatedTokens` | `0` (computed later)  |
 * | `priority`        | `50`                  |
 * | `lifecycle`       | `{ type: "permanent" }` |
 * | `frequency`       | `{}` (no limits)      |
 * | `tags`            | `[]`                  |
 * | `group`           | `""`                  |
 */
export interface EntryInput {
  /** Optional explicit id.  If omitted, computed from the entry content. */
  readonly id?: string;

  /** Human-readable name for `{{name}}` resolution. */
  readonly name: string;

  /** Version.  If omitted, defaults to 1. */
  readonly version?: number;

  /** Discriminates how `content` is interpreted. */
  readonly kind: EntryKind;

  /** The entry payload (inline text, file path, or generator id). */
  readonly content: string;

  /** MIME type.  Defaults to `"text/markdown"`. */
  readonly mimeType?: string;

  /** One-line description shown in the table of contents. */
  readonly description: string;

  /** Capability names this entry provides. */
  readonly capabilities?: readonly string[];

  /** Entry IDs this entry depends on. */
  readonly depends?: readonly string[];

  /** Entry IDs this entry conflicts with. */
  readonly conflicts?: readonly string[];

  /** Estimated token count.  Defaults to 0 (auto-computed on first load). */
  readonly estimatedTokens?: number;

  /** Priority (0–100).  Defaults to 50. */
  readonly priority?: number;

  /** Lifecycle config.  Defaults to `{ type: "permanent" }`. */
  readonly lifecycle?: Lifecycle;

  /** Frequency gate.  Defaults to `{}` (no caps — always allowed). */
  readonly frequency?: FrequencyGate;

  /** Tags for grouping and lookup.  Defaults to `[]`. */
  readonly tags?: readonly string[];

  /** Organizational group.  Defaults to `""`. */
  readonly group?: string;
}

// ---------------------------------------------------------------------------
// 3. Capability — named interface entries can provide
// ---------------------------------------------------------------------------

/**
 * A named capability that entries can declare.
 *
 * Capabilities form a simple subsumption hierarchy via `implies`.  When the
 * pipeline looks for entries that satisfy a requested capability, it also
 * considers every capability that the requested one implies.
 *
 * @example
 * ```ts
 * const cap: Capability = {
 *   name: "filesystem-write",
 *   description: "Write access to project files",
 *   implies: ["filesystem-read"],          // write implies read
 *   defaultEntryIds: ["fs-write-policy"],
 * };
 * ```
 */
export interface Capability {
  /** Unique capability identifier (e.g. `"filesystem-write"`). */
  readonly name: string;

  /** Human-readable description of what this capability provides. */
  readonly description: string;

  /** Other capability names automatically satisfied when this one is requested. */
  readonly implies?: readonly string[];

  /** Entry IDs to mount by default when this capability is requested. */
  readonly defaultEntryIds?: readonly string[];
}

// ---------------------------------------------------------------------------
// 4. ContextRequest — submitted by orchestrator
// ---------------------------------------------------------------------------

/**
 * A request for context assembly, submitted by the orchestrator.
 *
 * Specifies which entries to consider (via capabilities, explicit IDs, and/or
 * tags), budget constraints, and entries that must be included regardless of
 * budget.
 */
export interface ContextRequest {
  /** Selection criteria — what entries the pipeline should consider. */
  readonly want: {
    /** Mount entries that satisfy these capability names. */
    readonly capabilities?: readonly string[];
    /** Mount these specific entry IDs. */
    readonly entryIds?: readonly string[];
    /** Mount entries that carry at least one of these tags. */
    readonly tags?: readonly string[];
  };

  /** Budget constraints for the assembly. */
  readonly budget?: {
    /** Hard cap on total tokens across all mounted entries. */
    readonly maxTokens: number;
    /** Hard cap on the number of entries that may be mounted. */
    readonly maxEntries: number;
  };

  /** Whether frequency gates should be enforced (defaults to `true`). */
  readonly enforceFrequency?: boolean;

  /**
   * Entry IDs that MUST be included in the assembly.
   * These bypass all budget checks but still respect lifecycle and frequency.
   */
  readonly pinnedEntryIds?: readonly string[];
}

// ---------------------------------------------------------------------------
// 5. ContextAssembly — output of the pipeline
// ---------------------------------------------------------------------------

/**
 * The result of assembling context from a `ContextRequest`.
 *
 * Three lists capture the full disposition of every entry the pipeline
 * considered:
 *
 * | List       | What it contains                                     |
 * |------------|------------------------------------------------------|
 * | `mounted`  | Entries that passed all checks and are included       |
 * | `excluded` | Entries that were considered but rejected             |
 * | `pool`     | All available entries (metadata-only, for ToC display)|
 */
export interface ContextAssembly {
  /** Entries that passed the pipeline and were mounted into the prompt. */
  readonly mounted: readonly MountedEntry[];

  /** Entries that were considered but rejected (with reason). */
  readonly excluded: readonly ExcludedEntry[];

  /** All available entries (metadata only, no content) for the ToC. */
  readonly pool: readonly PoolEntry[];

  /** Aggregated assembly metrics. */
  readonly metrics: AssemblyMetrics;
}

// ---------------------------------------------------------------------------
// 6. MountedEntry — an entry that passed the pipeline
// ---------------------------------------------------------------------------

/** Why an entry was mounted into the assembly. */
export type MountReason = "pinned" | "capability" | "dependency" | "tag-match";

/**
 * An entry that successfully passed through the assembly pipeline and
 * was mounted into the context.
 *
 * Includes the actual resolved token count, which may differ from the
 * entry's `estimatedTokens` after content is loaded from disk or generated.
 */
export interface MountedEntry {
  /** The entry (full data, including resolved content). */
  readonly entry: Entry;

  /** Why this entry was mounted. */
  readonly reason: MountReason;

  /** Actual token count after content resolution (loaded from file / generated). */
  readonly tokens: number;

  /**
   * Content must be loaded from disk by the runtime layer.
   * True when `entry.kind === "file"`.
   * The pipeline sets this flag; actual I/O is deferred.
   */
  readonly needsRead: boolean;

  /**
   * Content must be generated by the runtime layer.
   * True when `entry.kind === "generator"`.
   * The pipeline sets this flag; actual generation is deferred.
   */
  readonly needsGenerate: boolean;
}

// ---------------------------------------------------------------------------
// 7. ExcludedEntry — an entry rejected by pipeline
// ---------------------------------------------------------------------------

/** Why an entry was excluded from the assembly. */
export type ExcludeReason =
  | "budget"
  | "frequency"
  | "conflict"
  | "lifecycle"
  | "missing-dep"
  | "not-found";

/**
 * An entry that was considered for mounting but ultimately rejected.
 *
 * Callers can inspect the `excluded` list to diagnose why a particular
 * entry was not included — useful for debugging and for surfacing
 * diagnostics to the LLM.
 */
export interface ExcludedEntry {
  /** The entry that was rejected (metadata fields available, content may be empty). */
  readonly entry: Entry;

  /** Why this entry was excluded. */
  readonly reason: ExcludeReason;

  /** Human-readable explanation of the exclusion. */
  readonly detail: string;
}

// ---------------------------------------------------------------------------
// 8. PoolEntry — available but not requested
// ---------------------------------------------------------------------------

/**
 * An entry that exists in the registry but was not selected by the request.
 *
 * Only metadata fields are surfaced; `content` is the empty string to avoid
 * leaking tokens.  Pool entries drive the table of contents so callers can
 * discover entries for future requests.
 */
export interface PoolEntry {
  /** The entry metadata.  `content` is always `""`. */
  readonly entry: Entry;
}

// ---------------------------------------------------------------------------
// 9. AssemblyMetrics
// ---------------------------------------------------------------------------

/**
 * Aggregate statistics for a completed context assembly.
 */
export interface AssemblyMetrics {
  /** Sum of actual tokens across all mounted entries. */
  readonly totalTokens: number;

  /** Percentage of the requested token budget consumed (0–100). */
  readonly budgetUsedPercent: number;

  /** Number of entries successfully mounted. */
  readonly mountedCount: number;

  /** Number of entries excluded from the assembly. */
  readonly excludedCount: number;

  /** Number of entries in the pool (available but not requested). */
  readonly poolCount: number;
}

// ---------------------------------------------------------------------------
// 10. FinalPrompt — output of composer
// ---------------------------------------------------------------------------

/**
 * The final assembled prompt, ready to be sent to the LLM.
 *
 * The composer assembles raw prompt sections and attaches the metrics
 * from the pipeline so the caller can report or log them.
 */
export interface FinalPrompt {
  /** Ordered list of prompt sections. */
  readonly sections: readonly PromptSection[];

  /** Metrics from the assembly pipeline. */
  readonly metrics: AssemblyMetrics;
}

// ---------------------------------------------------------------------------
// 11. PromptSection
// ---------------------------------------------------------------------------

/** The role a section plays in the final prompt. */
export type SectionRole = "toc" | "injected" | "context";

/**
 * A single section within the final assembled prompt.
 *
 * | Role       | Content                                               |
 * |------------|-------------------------------------------------------|
 * | `"toc"`    | Table of contents listing available (pool) entries     |
 * | `"injected"` | Full content of one or more mounted entries          |
 * | `"context"` | The base prompt with `{{name}}` placeholders resolved |
 */
export interface PromptSection {
  /** What this section represents in the prompt structure. */
  readonly role: SectionRole;

  /** The rendered text content of this section. */
  readonly content: string;
}

// ---------------------------------------------------------------------------
// 12. AddMode
// ---------------------------------------------------------------------------

/**
 * Whether an entry survives beyond the current session.
 *
 * - `"persistent"` : written to durable storage (`registry.jsonl`), survives
 *                    process restarts and agent handoffs.
 * - `"transient"`  : exists only in the in-memory index for the current run.
 *                    Lost when the run ends or the process restarts.
 */
export type AddMode = "persistent" | "transient";

// ---------------------------------------------------------------------------
// 13. RunContext — pipeline context at assembly time
// ---------------------------------------------------------------------------

/**
 * Context provided to the assembly pipeline at resolution time.
 *
 * Carries session and run identity so lifecycle, frequency, and scoping
 * checks can operate correctly.
 */
export interface RunContext {
  /** Current conversation round number (0-based). */
  readonly currentRound: number;

  /** Unique session identifier.  Persists across continuations of the same run. */
  readonly sessionId: string;

  /** Unique run identifier.  Changes on every invocation. */
  readonly runId: string;

  /**
   * Current wall-clock time in milliseconds since epoch.
   * Required for `time-window` lifecycle checks.
   * If omitted, `Date.now()` is used as a fallback (making that check
   * the only impurity in an otherwise deterministic pipeline).
   */
  readonly currentTimestampMs?: number;
}

// ---------------------------------------------------------------------------
// 14. CallRecord — frequency tracking history
// ---------------------------------------------------------------------------

/**
 * A single recorded call/injection of an entry, used by the pipeline's
 * frequency-gate check to determine whether an entry exceeds its caps.
 *
 * The pipeline receives a map of entry ID to its call history via
 * the `frequencyState` parameter of `resolve()`.
 */
export interface CallRecord {
  /** The entry that was injected. */
  readonly entryId: string;

  /** Round identifier (opaque string, ordered by timestamp). */
  readonly roundId: string;

  /** Unix ms when the injection occurred. */
  readonly timestamp: number;
}
