/**
 * runtime/actions.ts — MountController
 *
 * =============================================================================
 * Manages the mutable "schedule state" at runtime.
 * The LLM calls mount/unmount/view operations to dynamically adjust context.
 * =============================================================================
 *
 * # State Model
 *
 * ```
 * interface ScheduleState {
 *   request: ContextRequest    // current active request (accumulated)
 *   assembly: ContextAssembly  // last resolved assembly
 * }
 * ```
 *
 * # State Transitions
 *
 * ```
 * mount(spec)
 *   ├─ entries[]  → registry.add(entry, "transient") for each, track IDs
 *   ├─ merge spec into request.want (concat + dedup via Set)
 *   ├─ pipeline.resolve(request, registry, runContext, frequencyState)
 *   ├─ store assembly, log event
 *   └─ return assembly
 *
 * unmount(spec)
 *   ├─ remove matching entries from request (Set.delete)
 *   ├─ pipeline.resolve(request, registry, runContext, frequencyState)
 *   ├─ compare old/new mounted IDs → find removed entries
 *   ├─ removed entries that are tracked transient → registry.remove(id)
 *   ├─ log event
 *   └─ return new assembly
 *
 * view(scope)
 *   └─ return subset of assembly (mounted / available / full)
 *
 * processAction(action)
 *   ├─ type "schedule"   → mount(...)
 *   ├─ type "unschedule" → unmount(...)
 *   └─ unknown type      → throw Error
 * ```
 *
 * # Edge Cases
 *
 * | Scenario                                    | Behavior                                 |
 * |---------------------------------------------|------------------------------------------|
 * | Mount with empty spec                       | Re-resolve current request (idempotent)  |
 * | Duplicate entries in spec fields            | Dedup via Set                            |
 * | Unmount entries not in request              | No-op (Set.delete is idempotent)         |
 * | Transient entry unmounted                   | Removed from registry automatically      |
 * | Mount duplicate transient                   | registry.add() is idempotent (existing)  |
 * | Mount transient that already exists         | Registry returns existing ID, idempotent |
 * | Empty registry                              | Assembly: mounted=[], pool=[]            |
 * | Pipeline throws (cycle, conflict)           | Error propagates to caller               |
 * | Double-mount same spec                      | Merged via Set dedup, pipeline re-runs   |
 * | Unmount capability not in request           | Set.delete is no-op                      |
 */

import type {
  ContextRequest,
  ContextAssembly,
  EntryInput,
  MountedEntry,
  PoolEntry,
  RunContext,
  CallRecord,
} from "../core/types.ts";
import type { Registry } from "../core/registry.ts";
import type { CapabilityRegistry } from "../core/capability.ts";

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

/**
 * Signature of the pipeline resolve function.
 *
 * Injected via constructor so the controller is testable with a mock
 * pipeline.  Matches the signature of {@link import("../core/pipeline.ts").resolve}.
 */
export type ResolveFn = (
  request: ContextRequest,
  registry: Registry,
  context: RunContext,
  frequencyState?: Map<string, CallRecord[]>,
) => ContextAssembly;

/**
 * Full state of the MountController at a point in time.
 *
 * Useful for snapshots, serialization, and diagnostics.
 */
export interface ScheduleState {
  /** Current active request (accumulated across mount calls). */
  readonly request: ContextRequest;
  /** Last resolved assembly from the pipeline. */
  readonly assembly: ContextAssembly;
}

/**
 * Spec for {@link MountController.mount} — what to add to the schedule.
 *
 * All fields are optional.  An empty spec re-resolves without changes.
 * Fields are merged with concat + dedup semantics (Set).
 */
export interface MountSpec {
  /** Capability names to add to request.want.capabilities. */
  readonly capabilities?: readonly string[];
  /** Entry IDs to add to request.want.entryIds. */
  readonly entryIds?: readonly string[];
  /** Tags to add to request.want.tags. */
  readonly tags?: readonly string[];
  /**
   * Transient entries to register on the fly.
   *
   * Each entry is added to the registry with mode "transient" before the
   * pipeline runs.  If the entry is later unmounted it is automatically
   * removed from the registry.
   */
  readonly entries?: readonly EntryInput[];
}

/**
 * Spec for {@link MountController.unmount} — what to remove from the
 * schedule.
 *
 * Fields are removed from the request via Set.delete.  Removing a field
 * that is not present in the current request is a no-op.
 */
export interface UnmountSpec {
  /** Entry IDs to remove from request.want.entryIds. */
  readonly entryIds?: readonly string[];
  /** Capability names to remove from request.want.capabilities. */
  readonly capabilities?: readonly string[];
  /** Tags to remove from request.want.tags. */
  readonly tags?: readonly string[];
}

/**
 * Scope for {@link MountController.view}.
 *
 * - `"mounted"`   → only the mounted entries from the current assembly.
 * - `"available"` → only the pool entries (available but not mounted).
 * - `"full"`      → complete ContextAssembly (default).
 */
export type ViewScope = "mounted" | "available" | "full";

/**
 * Result of {@link MountController.view}.
 *
 * The returned subset depends on the requested scope:
 *
 * | Scope        | Populated field |
 * |--------------|-----------------|
 * | `"mounted"` | `mounted`       |
 * | `"available"`| `available`    |
 * | `"full"`    | `assembly`       |
 */
export interface ViewResult {
  /** Mounted entries from the current assembly (scope "mounted"). */
  readonly mounted?: readonly MountedEntry[];
  /** Available pool entries (scope "available"). */
  readonly available?: readonly PoolEntry[];
  /** Full context assembly (scope "full"). */
  readonly assembly?: ContextAssembly;
}

/**
 * Action processed by {@link MountController.processAction}.
 *
 * Bridges the old action-schema format (used by `runtime/orchestrator.ts`)
 * with the controller's mount/unmount operations.
 */
export interface ProcessAction {
  /** "schedule" → mount(), "unschedule" → unmount(). */
  readonly type: "schedule" | "unschedule";
  /** Capability names to add or remove. */
  readonly capabilities?: readonly string[];
  /** Entry IDs to add or remove. */
  readonly entryIds?: readonly string[];
  /** Tags to add or remove. */
  readonly tags?: readonly string[];
  /** Transient entries to add (mount only, ignored for unschedule). */
  readonly entries?: readonly EntryInput[];
}

// ---------------------------------------------------------------------------
// Event types (for logger callback)
// ---------------------------------------------------------------------------

/** Event emitted after a successful {@link MountController.mount}. */
export interface MountEvent {
  readonly type: "mount";
  /** The spec that was mounted. */
  readonly spec: MountSpec;
  /** Request before the mount operation. */
  readonly prevRequest: ContextRequest;
  /** Request after the mount operation (merged). */
  readonly newRequest: ContextRequest;
  /** Assembly produced by re-resolving after mount. */
  readonly assembly: ContextAssembly;
  /** Transient entry IDs that were added to the registry (if any). */
  readonly transientIdsAdded?: readonly string[];
}

/** Event emitted after a successful {@link MountController.unmount}. */
export interface UnmountEvent {
  readonly type: "unmount";
  /** The spec that was unmounted. */
  readonly spec: UnmountSpec;
  /** Request before the unmount operation. */
  readonly prevRequest: ContextRequest;
  /** Request after the unmount operation (reduced). */
  readonly newRequest: ContextRequest;
  /** Assembly produced by re-resolving after unmount. */
  readonly assembly: ContextAssembly;
  /** Transient entry IDs that were removed from the registry (if any). */
  readonly transientIdsRemoved?: readonly string[];
}

/** Union of all schedule events for the logger callback. */
export type ScheduleEvent = MountEvent | UnmountEvent;

// ---------------------------------------------------------------------------
// MountController
// ---------------------------------------------------------------------------

/**
 * Controller for the mutable "schedule state" at runtime.
 *
 * The LLM (or orchestrator) calls mount/unmount/view to dynamically control
 * which context entries are included in the assembly.  Each mutation
 * re-resolves the pipeline so the controller always reflects current state.
 *
 * # Lifecycle
 *
 * ```
 * ┌──────────┐   mount()    ┌───────────────┐   resolve()   ┌──────────┐
 * │  LLM /   │ ─────────►  │ MountController │ ─────────►  │ Pipeline │
 * │  Runner  │ ◄─────────  │  (stateful)    │ ◄─────────  │  (pure)  │
 * └──────────┘   return     └───────────────┘   return     └──────────┘
 * ```
 *
 * # Thread-safety
 *
 * This class is **not** thread-safe.  Concurrent callers must provide their
 * own synchronisation.
 */
export class MountController {
  // -------------------------------------------------------------------------
  // Private state
  // -------------------------------------------------------------------------

  /** Current accumulated request.  Starts empty, grows with each mount(). */
  private request: ContextRequest;

  /** Last resolved assembly.  Updated on every mount() / unmount(). */
  private assembly: ContextAssembly;

  /**
   * Entry IDs that were added as transient via mount().entries.
   *
   * Tracked separately so unmount() can clean up the registry entries it
   * created.  The Registry's own transient-IDs set is private and may
   * include transients from other sources, so we cannot rely on it alone.
   */
  private readonly mountTransientIds = new Set<string>();

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------

  /**
   * @param registry           - In-memory entry registry (mutable, shared).
   * @param capabilityRegistry - Capability definitions and implies DAG.
   * @param pipeline           - Pure pipeline resolve function to run on
   *                              each mutation.
   * @param runContext         - Current run context (round, session, run).
   * @param frequencyState     - Optional call history for frequency-gate
   *                              enforcement.  Pass an empty Map or omit
   *                              when frequency is not tracked.
   * @param logger             - Optional callback invoked after every
   *                              mount/unmount for telemetry or audit.
   */
  constructor(
    private readonly registry: Registry,
    private readonly _capabilityRegistry: CapabilityRegistry,
    private readonly pipeline: ResolveFn,
    private readonly runContext: RunContext,
    private readonly frequencyState?: Map<string, CallRecord[]>,
    private readonly logger?: (event: ScheduleEvent) => void,
  ) {
    // Initialise with an empty request and resolve once so the assembly
    // reflects whatever entries are already in the registry (pool).
    this.request = { want: {} };
    this.assembly = this.pipeline(
      this.request,
      this.registry,
      this.runContext,
      this.frequencyState,
    );
  }

  // -------------------------------------------------------------------------
  // LLM-callable operations
  // -------------------------------------------------------------------------

  /**
   * Mount entries into the context.
   *
   * **Step-by-step:**
   *
   * 1. **Transient registration** — if `spec.entries` is provided, each
   *    entry is registered with the registry as `"transient"`.
   *    `registry.add()` is idempotent: if an entry with the same ID already
   *    exists, the existing ID is returned and no mutation occurs.  Newly
   *    added IDs are tracked internally for later cleanup.
   *
   * 2. **Merge** — `spec.capabilities`, `spec.entryIds`, and `spec.tags`
   *    are merged into the current request using concat + dedup via Set.
   *    Fields not in the spec (`budget`, `pinnedEntryIds`,
   *    `enforceFrequency`) are preserved unchanged.
   *
   * 3. **Resolve** — the pipeline re-runs with the merged request.
   *
   * 4. **Log** — if a logger was provided, a `MountEvent` is emitted.
   *
   * @param spec - What to add to the schedule.  All fields are optional.
   * @returns The new ContextAssembly after re-resolution.
   */
  mount(spec: MountSpec): ContextAssembly {
    // -- Expand capabilities through implies DAG ---------------------------
    // The CapabilityRegistry expands implies chains so that requesting
    // "filesystem-write" also satisfies "filesystem-read" if declared.
    const expandedSpec: MountSpec =
      spec.capabilities && spec.capabilities.length > 0
        ? {
            ...spec,
            capabilities: this._capabilityRegistry.expand([
              ...spec.capabilities,
            ]),
          }
        : spec;

    // -- Step 1: Register transient entries --------------------------------
    const transientIdsAdded: string[] = [];
    if (expandedSpec.entries && expandedSpec.entries.length > 0) {
      for (const entryInput of expandedSpec.entries) {
        const id = this.registry.add(entryInput, "transient");
        // Only track IDs we have not seen before (idempotent add).
        if (!this.mountTransientIds.has(id)) {
          this.mountTransientIds.add(id);
          transientIdsAdded.push(id);
        }
      }
    }

    // -- Step 2: Merge spec into request -----------------------------------
    const prevRequest = this.request;
    const newRequest = this.mergeRequest(prevRequest, expandedSpec);

    // -- Step 3: Re-resolve ------------------------------------------------
    this.request = newRequest;
    this.assembly = this.pipeline(
      this.request,
      this.registry,
      this.runContext,
      this.frequencyState,
    );

    // -- Step 4: Log event -------------------------------------------------
    if (this.logger) {
      this.logger({
        type: "mount",
        spec,
        prevRequest,
        newRequest,
        assembly: this.assembly,
        ...(transientIdsAdded.length > 0 ? { transientIdsAdded } : {}),
      });
    }

    return this.assembly;
  }

  /**
   * Unmount entries from the context.
   *
   * **Step-by-step:**
   *
   * 1. **Reduce request** — `spec.capabilities`, `spec.entryIds`, and
   *    `spec.tags` are removed from the current request via Set.delete.
   *    Removing a criterion that is not present is a no-op.
   *
   * 2. **Resolve** — the pipeline re-runs with the reduced request.
   *
   * 3. **Transient cleanup** — entries that were mounted in the previous
   *    assembly but are no longer mounted in the new assembly are checked
   *    against the internally tracked transient set.  Any match is removed
   *    from the registry and the tracker.
   *
   *    Only entries that were **actually mounted** and then **actually
   *    removed** by this operation are cleaned up.  A transient entry that
   *    was never mounted (e.g. excluded by budget) stays in the registry
   *    and can be mounted later.
   *
   * 4. **Log** — if a logger was provided, an `UnmountEvent` is emitted.
   *
   * @param spec - What to remove from the schedule.  All fields are
   *   optional.  An empty spec re-resolves without changes.
   * @returns The new ContextAssembly after re-resolution.
   */
  unmount(spec: UnmountSpec): ContextAssembly {
    const prevRequest = this.request;
    const prevAssembly = this.assembly;

    // -- Step 1: Remove matching entries from request ----------------------
    const newRequest = this.reduceRequest(prevRequest, spec);

    // -- Step 2: Re-resolve ------------------------------------------------
    this.request = newRequest;
    this.assembly = this.pipeline(
      this.request,
      this.registry,
      this.runContext,
      this.frequencyState,
    );

    // -- Step 3: Cleanup transient entries no longer mounted ---------------
    const transientIdsRemoved: string[] = [];
    if (this.mountTransientIds.size > 0) {
      const prevMountedIds = new Set(
        prevAssembly.mounted.map((m) => m.entry.id),
      );
      const newMountedIds = new Set(
        this.assembly.mounted.map((m) => m.entry.id),
      );

      for (const id of this.mountTransientIds) {
        // Entry was in the previous assembly but is no longer mounted.
        if (prevMountedIds.has(id) && !newMountedIds.has(id)) {
          this.registry.remove(id);
          this.mountTransientIds.delete(id);
          transientIdsRemoved.push(id);
        }
      }
    }

    // -- Step 4: Log event -------------------------------------------------
    if (this.logger) {
      this.logger({
        type: "unmount",
        spec,
        prevRequest,
        newRequest,
        assembly: this.assembly,
        ...(transientIdsRemoved.length > 0 ? { transientIdsRemoved } : {}),
      });
    }

    return this.assembly;
  }

  /**
   * View the current assembly state without mutating it.
   *
   * @param scope - Which subset to return:
   *   - `"mounted"`   → only `mounted` entries (subset of assembly).
   *   - `"available"` → only `pool` entries (available, not mounted).
   *   - `"full"`      → the complete `ContextAssembly` (default).
   * @returns A view result with the requested subset populated; other
   *   fields are `undefined`.
   */
  view(scope: ViewScope = "full"): ViewResult {
    switch (scope) {
      case "mounted":
        return { mounted: this.assembly.mounted };
      case "available":
        return { available: this.assembly.pool };
      case "full":
      default:
        return { assembly: this.assembly };
    }
  }

  // -------------------------------------------------------------------------
  // Serialization / deserialization
  // -------------------------------------------------------------------------

  /**
   * Return the current accumulated request for serialization.
   *
   * Use this to persist the schedule state between runs or across agent
   * handoffs.  Restore with {@link setSchedule}.
   *
   * The returned object is a snapshot; mutations to it do not affect the
   * controller.
   */
  getSchedule(): ContextRequest {
    return this.request;
  }

  /**
   * Restore the schedule state from a previously serialized request.
   *
   * Sets the internal request and re-resolves the pipeline to produce a
   * matching assembly.  Existing transient-entry tracking is preserved
   * (IDs added via mount() before restore remain tracked).
   *
   * @param request - A previously exported ContextRequest (typically from
   *   {@link getSchedule}).
   */
  setSchedule(request: ContextRequest): void {
    this.request = request;
    this.assembly = this.pipeline(
      this.request,
      this.registry,
      this.runContext,
      this.frequencyState,
    );
  }

  /**
   * Return the current assembly for direct inspection or handoff to the
   * composer.
   */
  getAssembly(): ContextAssembly {
    return this.assembly;
  }

  // -------------------------------------------------------------------------
  // Integration with run lifecycle
  // -------------------------------------------------------------------------

  /**
   * Process a lifecycle action (adapter).
   *
   * Bridges the old action-schema format (used by `runtime/orchestrator.ts`)
   * with the controller's mount/unmount operations:
   *
   * | `action.type`  | Delegates to  |
   * |----------------|---------------|
   * | `"schedule"`   | {@link mount} |
   * | `"unschedule"` | {@link unmount} |
   *
   * @param action - The action to process.
   * @returns The resulting ContextAssembly after re-resolution.
   * @throws {Error} If `action.type` is neither `"schedule"` nor
   *   `"unschedule"`.
   */
  processAction(action: ProcessAction): ContextAssembly {
    switch (action.type) {
      case "schedule":
        return this.mount({
          ...(action.capabilities !== undefined
            ? { capabilities: action.capabilities }
            : {}),
          ...(action.entryIds !== undefined
            ? { entryIds: action.entryIds }
            : {}),
          ...(action.tags !== undefined ? { tags: action.tags } : {}),
          ...(action.entries !== undefined
            ? { entries: action.entries }
            : {}),
        });
      case "unschedule":
        return this.unmount({
          ...(action.entryIds !== undefined
            ? { entryIds: action.entryIds }
            : {}),
          ...(action.capabilities !== undefined
            ? { capabilities: action.capabilities }
            : {}),
          ...(action.tags !== undefined ? { tags: action.tags } : {}),
        });
      default:
        throw new Error(
          `Unknown action type: "${(action as { type: string }).type}". `
            + 'Expected "schedule" or "unschedule".',
        );
    }
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Merge a MountSpec into an existing ContextRequest.
   *
   * Merge rules:
   * - `capabilities`: concat + dedup via Set.
   * - `entryIds`: concat + dedup via Set.
   * - `tags`: concat + dedup via Set.
   * - `budget`, `pinnedEntryIds`, `enforceFrequency`: preserved from the
   *   existing request (the spec does not touch these).
   *
   * If the merge result leaves `want` with all empty fields, `want` is
   * still present (empty object) to satisfy the ContextRequest type.
   *
   * @param existing - The current ContextRequest.
   * @param spec     - Spec whose fields should be added.
   * @returns A new ContextRequest with the spec merged in.
   */
  private mergeRequest(
    existing: ContextRequest,
    spec: MountSpec,
  ): ContextRequest {
    const want: {
      capabilities?: string[];
      entryIds?: string[];
      tags?: string[];
    } = {};

    // Capabilities
    const caps = new Set(existing.want.capabilities ?? []);
    if (spec.capabilities) {
      for (const c of spec.capabilities) caps.add(c);
    }
    if (caps.size > 0) want.capabilities = [...caps];

    // Entry IDs
    const ids = new Set(existing.want.entryIds ?? []);
    if (spec.entryIds) {
      for (const id of spec.entryIds) ids.add(id);
    }
    if (ids.size > 0) want.entryIds = [...ids];

    // Tags
    const tags = new Set(existing.want.tags ?? []);
    if (spec.tags) {
      for (const t of spec.tags) tags.add(t);
    }
    if (tags.size > 0) want.tags = [...tags];

    // Preserve top-level fields the spec does not touch.
    return {
      want,
      ...(existing.budget !== undefined
        ? { budget: existing.budget }
        : {}),
      ...(existing.enforceFrequency !== undefined
        ? { enforceFrequency: existing.enforceFrequency }
        : {}),
      ...(existing.pinnedEntryIds !== undefined
        ? { pinnedEntryIds: existing.pinnedEntryIds }
        : {}),
    };
  }

  /**
   * Remove UnmountSpec fields from an existing ContextRequest.
   *
   * Remove rules:
   * - `capabilities`: each named capability is removed from the set.
   * - `entryIds`: each named ID is removed from the set.
   * - `tags`: each named tag is removed from the set.
   * - `budget`, `pinnedEntryIds`, `enforceFrequency`: preserved unchanged.
   *
   * Removing a criterion that is not in the request is a no-op for that
   * criterion.
   *
   * @param existing - The current ContextRequest.
   * @param spec     - Spec whose fields should be removed.
   * @returns A new ContextRequest with the spec fields removed.
   */
  private reduceRequest(
    existing: ContextRequest,
    spec: UnmountSpec,
  ): ContextRequest {
    const want: {
      capabilities?: string[];
      entryIds?: string[];
      tags?: string[];
    } = {};

    // Capabilities
    if (existing.want.capabilities) {
      const caps = new Set(existing.want.capabilities);
      if (spec.capabilities) {
        for (const c of spec.capabilities) caps.delete(c);
      }
      if (caps.size > 0) want.capabilities = [...caps];
    }

    // Entry IDs
    if (existing.want.entryIds) {
      const ids = new Set(existing.want.entryIds);
      if (spec.entryIds) {
        for (const id of spec.entryIds) ids.delete(id);
      }
      if (ids.size > 0) want.entryIds = [...ids];
    }

    // Tags
    if (existing.want.tags) {
      const tags = new Set(existing.want.tags);
      if (spec.tags) {
        for (const t of spec.tags) tags.delete(t);
      }
      if (tags.size > 0) want.tags = [...tags];
    }

    return {
      want,
      ...(existing.budget !== undefined
        ? { budget: existing.budget }
        : {}),
      ...(existing.enforceFrequency !== undefined
        ? { enforceFrequency: existing.enforceFrequency }
        : {}),
      ...(existing.pinnedEntryIds !== undefined
        ? { pinnedEntryIds: existing.pinnedEntryIds }
        : {}),
    };
  }
}
