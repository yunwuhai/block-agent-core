/**
 * efficiency-subagent -- Programmatic Entry Point
 *
 * =============================================================================
 * Assembles all modules and exports the public API.
 *
 * Public API:
 *   executeRun(params)  — execute a subagent profile run
 *   { Registry, resolve, compose, CapabilityRegistry, types }  — core modules
 *
 * Wiring flow:
 *   1. Resolve project paths (registry.jsonl, runs dir, etc.)
 *   2. Initialize RegistryStore (persistence layer)
 *   3. Load registry from disk (RegistryStore.load())
 *   4. Load capabilities from disk (RegistryStore.loadCapabilities())
 *   5. Create MountController adapter
 *   6. Create RunLifecycle with all dependencies injected
 *   7. If runId provided -> RunLifecycle.continue(runId, params)
 *   8. If not -> RunLifecycle.create(params)
 *   9. Return RunResult
 * =============================================================================
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Re-exports for programmatic use
// ---------------------------------------------------------------------------

export { Registry } from "../core/registry.ts";
export { resolve } from "../core/pipeline.ts";
export { compose } from "../core/composer.ts";
export { CapabilityRegistry } from "../core/capability.ts";
export type * from "../core/types.ts";

// ---------------------------------------------------------------------------
// Internal imports for wiring
// ---------------------------------------------------------------------------

import type { ContextRequest, RunContext } from "../core/types.ts";
import { Registry } from "../core/registry.ts";
import { CapabilityRegistry } from "../core/capability.ts";
import { resolve as runPipeline } from "../core/pipeline.ts";
import type { MountController as MountControllerInterface } from "../runtime/run.ts";
import type { RunResult, Action } from "../runtime/run.ts";
import { RunLifecycle } from "../runtime/run.ts";
import { createProjectPaths, RegistryStore } from "../runtime/registry-store.ts";
import { MountController as ControllerImpl } from "../runtime/actions.ts";
import type { ResolveFn } from "../runtime/actions.ts";

// ---------------------------------------------------------------------------
// MountControllerAdapter
// ---------------------------------------------------------------------------

/**
 * Adapter that bridges the `actions.ts` MountController (mount/unmount API)
 * to the `run.ts` MountController interface (scheduleTags/Ids/Group API).
 *
 * The underlying ControllerImpl is created **lazily** on first use so that
 * the adapter can be constructed before the run ID is known.
 *
 * ## Run-context awareness
 *
 * The `runContext` used by the underlying controller determines how
 * session-scoped lifecycle entries and frequency gates are resolved. For
 * **continuation** runs the run ID is available at construction time and
 * is set correctly. For **new** runs the run ID is generated inside
 * `RunLifecycle.create()`, so the initial context is a placeholder.
 * In practice this only matters for entries with `lifecycle: "session"` —
 * permanent, rounds, and time-window entries are unaffected.
 *
 * Call `setRunContext()` to supply or update the context when it becomes
 * available.
 */
class MountControllerAdapter implements MountControllerInterface {
  /** Lazily-created underlying controller (actions.ts). */
  private impl: ControllerImpl | null = null;

  /** The last-resolved assembly from the underlying controller. */
  private lastAssembly: ReturnType<ControllerImpl["getAssembly"]> | null = null;

  constructor(
    private readonly registry: Registry,
    private readonly capabilities: CapabilityRegistry,
    private readonly pipelineFn: ResolveFn,
    private ctx: RunContext = { currentRound: 0, sessionId: "", runId: "" },
  ) {}

  // -----------------------------------------------------------------------
  // Context management
  // -----------------------------------------------------------------------

  /**
   * Set or update the run context, re-creating the underlying controller
   * on the next method call.
   */
  setRunContext(ctx: RunContext): void {
    this.ctx = ctx;
    this.impl = null;
    this.lastAssembly = null;
  }

  // -----------------------------------------------------------------------
  // Internal — lazy controller initialisation
  // -----------------------------------------------------------------------

  /**
   * Return the underlying controller, creating it on first call.
   */
  private ensure(): ControllerImpl {
    if (!this.impl) {
      this.impl = new ControllerImpl(
        this.registry,
        this.capabilities,
        this.pipelineFn,
        this.ctx,
      );
      this.lastAssembly = this.impl.getAssembly();
    }
    return this.impl;
  }

  // -----------------------------------------------------------------------
  // MountController interface (run.ts)
  // -----------------------------------------------------------------------

  scheduleTags(tags: readonly string[]): { scheduled: number; ids: string[] } {
    this.lastAssembly = this.ensure().mount({ tags: [...tags] });
    return {
      scheduled: this.lastAssembly.mounted.length,
      ids: this.lastAssembly.mounted.map((m) => m.entry.id),
    };
  }

  scheduleIds(ids: readonly string[]): { scheduled: number } {
    this.lastAssembly = this.ensure().mount({ entryIds: [...ids] });
    return { scheduled: this.lastAssembly.mounted.length };
  }

  scheduleGroup(group: string): { scheduled: number; ids: string[] } {
    const groupEntries = this.registry.findByGroup(group);
    const ids = groupEntries.map((e) => e.id);
    this.lastAssembly = this.ensure().mount({ entryIds: ids });
    return {
      scheduled: this.lastAssembly.mounted.length,
      ids: this.lastAssembly.mounted.map((m) => m.entry.id),
    };
  }

  unscheduleIds(ids: readonly string[]): { removed: number } {
    this.lastAssembly = this.ensure().unmount({ entryIds: [...ids] });
    return { removed: ids.length };
  }

  unscheduleTags(tags: readonly string[]): { removed: number } {
    const tagEntries = this.registry.findByTags([...tags], "any");
    const ids = tagEntries.map((e) => e.id);
    this.lastAssembly = this.ensure().unmount({ entryIds: ids });
    return { removed: ids.length };
  }

  clearSchedule(): void {
    this.ensure().setSchedule({ want: {} });
    this.lastAssembly = this.ensure().getAssembly();
  }
}

// ---------------------------------------------------------------------------
// executeRun
// ---------------------------------------------------------------------------

/**
 * Execute a subagent run.
 *
 * Creates a new run (or continues an existing one through `runId`), loads
 * the specified profile, resolves the registry, assembles context via the
 * pipeline, executes any provided actions, and produces artifacts (handoff
 * document and transcript).
 *
 * @param params.profile  — Profile name to invoke (`.profiles/<name>.md`).
 * @param params.task     — Task description for the subagent.
 * @param params.cwd      — Project working directory (used to resolve
 *                          `.subagent/registry.jsonl`, `.profiles/`, and
 *                          `.pi/better-subagent/runs/`).
 * @param params.runId    — Optional existing run ID for continuation.
 *                          When provided, the prior run's session and
 *                          registry state are restored before processing
 *                          new actions.
 * @param params.actions  — Optional action sequence. See `runtime/run.ts`
 *                          `Action` type for supported shapes.
 * @param params.schedule — Optional initial `ContextRequest` for the
 *                          assembly pipeline. When omitted the profile
 *                          prompt is used without registry assembly.
 * @returns A `RunResult` with status, artifact paths, and optional
 *          `ContextAssembly`.
 */
export async function executeRun(params: {
  profile: string;
  task: string;
  cwd: string;
  runId?: string;
  actions?: Action[];
  schedule?: ContextRequest;
}): Promise<RunResult> {
  // -- Step 1: Resolve project paths --
  const paths = createProjectPaths(params.cwd);

  // -- Step 2: Initialise RegistryStore --
  const store = new RegistryStore(paths.baseDir);

  // -- Step 3: Load registry from disk --
  const { registry } = await store.load();

  // -- Step 4: Load capabilities from disk --
  const { capabilities } = await store.loadCapabilities();

  // -- Step 5: Create MountController adapter --
  const runCtx: RunContext = {
    currentRound: 0,
    sessionId: params.runId ?? "new",
    runId: params.runId ?? "new",
  };
  const controllerAdapter = new MountControllerAdapter(
    registry,
    capabilities,
    runPipeline as ResolveFn,
    runCtx,
  );

  // -- Step 6: Create RunLifecycle --
  const lifecycle = new RunLifecycle(store, registry, controllerAdapter);

  // -- Step 7 or 8: Continue or create --
  if (params.runId) {
    // Continuation: update the adapter with the known run ID (the
    // controller was created with the same ID above, but this is explicit).
    controllerAdapter.setRunContext({
      currentRound: 0,
      sessionId: params.runId,
      runId: params.runId,
    });
    return lifecycle.continue(params.runId, {
      profile: params.profile,
      task: params.task,
      cwd: params.cwd,
      ...(params.actions !== undefined ? { actions: params.actions } : {}),
    });
  }

  // New run: the adapter uses the placeholder context. The RunLifecycle
  // will generate the final run ID internally. For session-scoped entries,
  // the adapter's context can be corrected via setRunContext() when the
  // run ID is known (future enhancement).
  return lifecycle.create({
    profile: params.profile,
    task: params.task,
    cwd: params.cwd,
    ...(params.actions !== undefined ? { actions: params.actions } : {}),
    ...(params.schedule !== undefined ? { request: params.schedule } : {}),
  });
}
