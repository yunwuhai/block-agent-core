/**
 * better-subagent — Run Lifecycle
 *
 * =============================================================================
 * A Run represents one subagent execution from start to finish.
 *
 * The RunLifecycle class orchestrates the full lifecycle:
 *
 *   create(config)   →  run directory, profile load, policy merge, registry
 *                        registration, ContextRequest → pipeline → assembly,
 *                        compose prompt, action loop, artifacts, persist
 *
 *   continue(runId)  →  restore prior session state, append run_continue event,
 *                        process new actions, produce updated artifacts
 *
 *   executeActionLoop →  iterate actions through policy checks, delegate
 *                        schedule/unschedule to MountController, log events
 *
 * Heavy-lifting is DELEGATED to:
 *   - Policy evaluator     (computation/policy/)
 *   - Assembly pipeline    (core/pipeline.ts)
 *   - Prompt composer      (core/composer.ts)
 *   - MountController      (abstraction over ScheduleOrchestrator)
 *   - Storage layer        (storage/event-log.ts)
 *
 * Dependencies are injected via constructor:
 *   @param registryStore    — Persistence layer for the core Registry (load/save).
 *   @param registry         — In-memory core Registry used by the assembly pipeline.
 *   @param mountController  — Schedule/unschedule operations (wraps the
 *                             computation layer's ScheduleOrchestrator).
 *
 * Threading model: single-threaded async (no parallelism within a single run).
 * The class is not safe for concurrent invocation on the same run ID.
 * =============================================================================
 */

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { ContextRequest, ContextAssembly, EntryInput, Lifecycle, FrequencyGate } from "../core/types.ts";
import { resolve as runPipeline } from "../core/pipeline.ts";
import { compose as composePrompt } from "../core/composer.ts";
import type { Registry } from "../core/registry.ts";
import {
  loadProfile,
  type ProfileDefinition,
} from "../input/mod.ts";
import { evaluate as evaluatePolicy, loadProfilePolicy } from "../computation/policy/mod.ts";
import type { Action as PolicyAction, Policy } from "../computation/policy/mod.ts";
import {
  deserializeSlots,
  registerPlaceholder,
  getEventLog,
} from "./prompt-state.ts";
import type { SerializedSlots } from "./prompt-state.ts";
import { RegistryStore } from "./registry-store.ts";
import {
  appendEvent,
  createRunDir,
  readEvents,
  readSession,
  writeSession,
  buildHandoff,
  buildTranscript,
  resolveRunsRoot,
} from "../storage/mod.ts";
import type {
  RunDirectory,
} from "../storage/mod.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Input configuration for creating a new run.
 *
 * @property profile   — Profile name to load from `.profiles/<name>.md`.
 * @property task      — Task description passed to the subagent.
 * @property cwd       — Working directory (project root).
 * @property actions   — Optional explicit action sequence. When omitted, the
 *                       action loop is a no-op (no actions to execute).
 * @property request   — Optional initial ContextRequest for the assembly
 *                       pipeline. When omitted, the pipeline is not run and
 *                       the profile prompt is used directly (no assembly).
 */
export interface RunConfig {
  readonly profile: string;
  readonly task: string;
  readonly cwd: string;
  readonly actions?: Action[];
  readonly request?: ContextRequest;
}

/**
 * Metadata state for an in-progress or completed run.
 *
 * @property id             — Unique run identifier.
 * @property profile        — Profile name the run was launched with.
 * @property task           — Task string.
 * @property startTime      — ISO 8601 timestamp of run creation.
 * @property status         — Current lifecycle status.
 * @property directory      — Absolute path to the run's artifact directory.
 * @property isContinuation — Whether this is a continuation of a prior run.
 * @property request        — The ContextRequest used (if any).
 */
export interface Run {
  readonly id: string;
  readonly profile: string;
  readonly task: string;
  readonly startTime: string;
  readonly status: "created" | "running" | "completed" | "failed" | "timedout";
  readonly directory: string;
  readonly isContinuation: boolean;
  readonly request?: ContextRequest;
}

/**
 * Result returned after a run completes or continues.
 *
 * @property id             — Run identifier.
 * @property status         — Final run status.
 * @property handoffPath    — Path to the generated handoff markdown file.
 * @property transcriptPath — Path to the generated transcript markdown file.
 * @property output         — Human-readable summary of the run outcome.
 * @property assembly       — The ContextAssembly produced by the pipeline, if
 *                            a ContextRequest was provided.
 */
export interface RunResult {
  readonly id: string;
  readonly status: string;
  readonly handoffPath: string;
  readonly transcriptPath: string;
  readonly output: string;
  readonly assembly?: ContextAssembly;
}

/** Minimal artifact result returned by produceArtifacts. */
interface ArtifactResult {
  readonly handoffPath: string;
  readonly transcriptPath: string;
}

/**
 * A single action within a run's action sequence.
 *
 * Three types:
 * - `tool_call`     : Evaluate against policy and simulate a tool invocation.
 * - `schedule`      : Delegate to MountController to schedule registry entries.
 * - `unschedule`    : Delegate to MountController to unschedule entries by ID.
 */
export type Action =
  | {
      readonly type: "tool_call";
      readonly tool: string;
      readonly args: Record<string, unknown>;
    }
  | {
      readonly type: "schedule";
      readonly tags?: readonly string[];
      readonly ids?: readonly string[];
      readonly group?: string;
    }
  | {
      readonly type: "unschedule";
      readonly entryIds: readonly string[];
    };

// ---------------------------------------------------------------------------
// MountController — interface for schedule/unschedule delegation
// ---------------------------------------------------------------------------

/**
 * Controller for scheduling and unscheduling registry entries during a run.
 *
 * The RunLifecycle delegates `schedule` and `unschedule` actions to this
 * abstraction.  The {@link import("./actions.ts").MountController} class
 * implements this contract.
 */
export interface MountController {
  /** Schedule entries by tag. Returns count of newly-scheduled entries and their IDs. */
  scheduleTags(tags: readonly string[]): { scheduled: number; ids: string[] };
  /** Schedule specific entries by ID. Returns count of newly-scheduled entries. */
  scheduleIds(ids: readonly string[]): { scheduled: number };
  /** Schedule all entries in a group. Returns count and IDs. */
  scheduleGroup(group: string): { scheduled: number; ids: string[] };
  /** Unschedule entries by ID. Returns count of removed entries. */
  unscheduleIds(ids: readonly string[]): { removed: number };
  /** Unschedule entries by tag. Returns count of removed entries. */
  unscheduleTags(tags: readonly string[]): { removed: number };
  /** Clear all scheduled state for the current round. */
  clearSchedule(): void;
}

// ---------------------------------------------------------------------------
// RunLifecycle
// ---------------------------------------------------------------------------

/**
 * Orchestrates the full lifecycle of a subagent run.
 *
 * Responsibilities:
 *   1. Run creation and ID generation.
 *   2. Profile loading, policy merging, registry initialisation.
 *   3. ContextRequest → pipeline → ContextAssembly → compose prompt.
 *   4. Action loop execution (tool calls, schedule, unschedule).
 *   5. Artifact generation (handoff, transcript).
 *   6. Registry persistence.
 *   7. Continuation (resume a prior run with new actions).
 *
 * Usage:
 * ```ts
 * const lifecycle = new RunLifecycle(registryStore, registry, mountController);
 * const result = await lifecycle.create({
 *   profile: "code-reviewer",
 *   task: "Review PR #42",
 *   cwd: "/home/user/project",
 *   request: { want: { capabilities: ["code-review"] } },
 * });
 * ```
 */
export class RunLifecycle {
  constructor(
    /** JSONL persistence layer for the core Registry. */
    private readonly registryStore: RegistryStore,
    /** In-memory core Registry used by the assembly pipeline and for add(). */
    private readonly registry: Registry,
    /** Schedule/unschedule operations (wraps computation-layer orchestrator). */
    private readonly mountController: MountController,
  ) {}

  // -----------------------------------------------------------------------
  // create
  // -----------------------------------------------------------------------

  /**
   * Create and execute a new run from scratch.
   *
   * Flow:
   *   1. Generate run ID: `{profile}-{task-slug}-{ISOtimestamp}-{6char-hex}`
   *      - slugify task: lowercase, replace non-alphanumeric runs with `-`,
   *        collapse consecutive hyphens, trim leading/trailing hyphens.
   *   2. Create run directory via storage/event-log.
   *   3. Write initial session.json with config metadata.
   *   4. Load profile from `.profiles/<name>.md`.
   *   5. Merge policies (project config + profile tools policy).
   *   6. Register profile entries into the in-memory Registry (placeholders
   *      via prompt engine, registry entries via `this.registry.add()`).
   *   7. If a ContextRequest is provided, run the assembly pipeline to produce
   *      a ContextAssembly, then compose the prompt via Composer.
   *   8. Execute action loop (process each action through policy/MountController).
   *   9. Produce artifacts: handoff document and transcript.
   *  10. Persist registry to disk via `this.registryStore.save()`.
   *  11. Return RunResult.
   *
   * Error handling: if any step fails, the run status is set to "failed" and
   * partial artifacts are still produced where possible so callers can
   * diagnose the failure.
   */
  async create(config: RunConfig): Promise<RunResult> {
    // ---- Step 1 — Generate run ID ----
    const runId = this.generateRunId(config.profile, config.task);

    // ---- Step 2 — Create run directory ----
    const runDir = await createRunDir(config.cwd, runId);

    // ---- Step 3 — Write initial session.json ----
    await this.writeSessionState(runDir, {
      runId,
      profile: config.profile,
      task: config.task,
      status: "running",
    });

    await this.logEvent(runDir, runId, "run_created", {
      profile: config.profile,
      task: config.task,
    });

    try {
      // ---- Step 4 — Load profile ----
      const profile = await loadProfile(config.cwd, config.profile);
      await this.logEvent(runDir, runId, "profile_loaded", {
        profileName: config.profile,
      });

      // ---- Step 5 — Merge policies ----
      const policy = await this.loadMergedPolicy(config.cwd, profile);

      // ---- Step 6 — Register profile entries ----
      this.registerProfileEntries(config.cwd, profile);

      // ---- Step 7 — Pipeline + Compose (if request provided) ----
      let assembly: ContextAssembly | undefined;

      if (config.request) {
        // The pipeline expects core/types.ts RunContext (currentRound, sessionId, runId).
        // Map from the computation layer's RegistryRunContext which has different field names.
        const pipelineCtx = {
          currentRound: 0,
          sessionId: runId,
          runId,
        };

        // Run the assembly pipeline against the core Registry.
        assembly = runPipeline(config.request, this.registry, pipelineCtx);

        // Compose the prompt from the assembly and the profile's base prompt.
        composePrompt(assembly, profile.prompt);

        await this.logEvent(runDir, runId, "prompt_composed", {
          mountedCount: assembly.metrics.mountedCount,
          excludedCount: assembly.metrics.excludedCount,
          totalTokens: assembly.metrics.totalTokens,
        });
      }

      // ---- Step 8 — Execute action loop ----
      const actions = config.actions ?? [];
      const runStatus = await this.executeActionLoop(
        { runDir, runId, profile, policy, isContinuation: false },
        actions,
      );

      // ---- Step 9 — Produce artifacts ----
      const artifacts = await this.produceArtifacts(
        { runDir, runId, profile, policy, isContinuation: false },
        runStatus,
        assembly,
      );

      await this.logEvent(runDir, runId, "run_end", {
        status: runStatus,
        handoffPath: artifacts.handoffPath,
      });

      // ---- Step 10 — Persist registry ----
      await this.registryStore.save(this.registry);

      // ---- Step 11 — Return result ----
      return this.buildResult(runId, runStatus, runDir, artifacts, assembly);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await this.logEvent(runDir, runId, "run_failed", { error: errorMsg });

      // Attempt to persist registry even on failure.
      await this.registryStore.save(this.registry).catch(() => {});

      return this.buildResult(runId, "failed", runDir, {
        handoffPath: runDir.handoffPath,
        transcriptPath: runDir.transcriptPath,
      });
    }
  }

  // -----------------------------------------------------------------------
  // continue
  // -----------------------------------------------------------------------

  /**
   * Continue a prior run by resuming its state and processing new actions.
   *
   * Flow:
   *   1. Assert that the run directory exists under `.pi/subagents/runs/`.
   *   2. Read session.json — restore prior run metadata.
   *   3. Check profile match: warn via event if different profile is used.
   *   4. Reload the core Registry from disk to restore prior run's state.
   *   5. Append `run_continue` event to the run's event log.
   *   6. Restore slots from the prior run's serialised state.
   *   7. Process any new actions provided in config.actions.
   *   8. Produce updated artifacts (handoff + transcript) that include both
   *      prior and new action results.
   *   9. Persist registry.
   *  10. Return updated RunResult.
   *
   * The prior run's directory is reused — no new directory is created.
   * If the prior run already completed, continuing appends to its log.
   *
   * @param runId  — ID of the existing run to continue.
   * @param config — Partial config; only `actions` and `task` are meaningful
   *                 for continuations. `profile` is read from session.json
   *                 and is optional here (warns on mismatch).
   */
  async continue(runId: string, config: Partial<RunConfig>): Promise<RunResult> {
    // ---- Step 1 — Assert run directory exists ----
    const cwd = config.cwd ?? process.cwd();
    const runsRoot = resolveRunsRoot(cwd);
    const dir = join(runsRoot, runId);

    if (!existsSync(dir)) {
      throw new Error(
        `Cannot continue run "${runId}": directory not found at ${dir}`,
      );
    }

    // Reuse the existing directory (createRunDir handles existing dirs).
    const runDir = await createRunDir(cwd, runId);

    // ---- Step 2 — Read session.json ----
    const priorState = await this.readSessionState(runDir);

    // ---- Step 3 — Check profile match ----
    if (priorState?.profile && config.profile && priorState.profile !== config.profile) {
      await this.logEvent(runDir, runId, "profile_mismatch", {
        originalProfile: priorState.profile,
        newProfile: config.profile,
      });
    }

    const effectiveProfile = priorState?.profile ?? config.profile ?? "unknown";

    // ---- Step 4 — Reload registry from disk ----
    const { registry } = await this.registryStore.load();
    // Merge reloaded entries into the in-memory registry.
    for (const entry of registry.list()) {
      this.registry.add(entry, "persistent");
    }

    // ---- Step 5 — Append run_continue event ----
    await this.logEvent(runDir, runId, "run_continue", {});

    // ---- Step 6 — Restore slots ----
    await this.restoreSlots(runDir);

    // ---- Step 7 — Process new actions ----
    const actions = config.actions ?? [];
    const runStatus = await this.executeActionLoop(
      {
        runDir,
        runId,
        profile: {
          frontmatter: { name: effectiveProfile, description: "" },
          prompt: "",
        },
        policy: null,
        isContinuation: true,
      },
      actions,
    );

    // ---- Step 8 — Produce updated artifacts ----
    const artifacts = await this.produceArtifacts(
      {
        runDir,
        runId,
        profile: {
          frontmatter: { name: effectiveProfile, description: "" },
          prompt: "",
        },
        policy: null,
        isContinuation: true,
      },
      runStatus,
    );

    await this.logEvent(runDir, runId, "run_end", {
      status: runStatus,
      handoffPath: artifacts.handoffPath,
    });

    // ---- Step 9 — Persist registry ----
    await this.registryStore.save(this.registry);

    // ---- Step 10 — Return result ----
    return this.buildResult(runId, runStatus, runDir, artifacts);
  }

  // -----------------------------------------------------------------------
  // executeActionLoop
  // -----------------------------------------------------------------------

  /**
   * Execute a sequence of actions for a run.
   *
   * Each action is dispatched by type:
   *
   * | Type          | Handler                                   |
   * |---------------|-------------------------------------------|
   * | `tool_call`   | Evaluate policy → log call event → record |
   * | `schedule`    | Delegate to MountController → reassemble  |
   * | `unschedule`  | Delegate to MountController → reassemble  |
   *
   * Error handling:
   * - If a single action fails, the error is logged and the loop continues
   *   to the next action.
   * - If the abort signal fires (timeout), remaining actions are skipped and
   *   the run status is set to `"timedout"`.
   *
   * @param ctx     — Run context providing directory, ID, profile, and policy.
   * @param actions — Ordered list of actions to process.
   * @returns The final run status after all actions are processed.
   */
  async executeActionLoop(
    ctx: RunLoopContext,
    actions: Action[],
  ): Promise<"created" | "running" | "completed" | "failed" | "timedout"> {
    if (actions.length === 0) {
      return "completed";
    }

    let status: "completed" | "failed" | "timedout" = "completed";

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i]!;

      try {
        switch (action.type) {
          case "tool_call":
            await this.handleToolCall(ctx, action, i, actions.length);
            break;

          case "schedule":
            await this.handleScheduleAction(ctx, action);
            break;

          case "unschedule":
            await this.handleUnscheduleAction(ctx, action);
            break;

          default:
            await this.logEvent(ctx.runDir, ctx.runId, "action_unknown", {
              index: i,
              type: (action as Action).type,
            });
            status = "failed";
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        await this.logEvent(ctx.runDir, ctx.runId, "action_error", {
          index: i,
          type: action.type,
          error: errorMsg,
        });
        // Continue to next action. Mark overall run as failed.
        status = "failed";
      }
    }

    return status;
  }

  // -----------------------------------------------------------------------
  // ID generation
  // -----------------------------------------------------------------------

  /**
   * Generate a human-readable run ID.
   *
   * Format: `{profile}-{task-slug}-{ISOtimestamp}-{6char-hex}`
   *
   * The task is slugified: lowercase, non-alphanumeric replaced with `-`,
   * consecutive hyphens collapsed, leading/trailing hyphens trimmed.
   * The timestamp uses ISO 8601 with colons/dots replaced by hyphens.
   * The suffix is a random 6-character hex string for disambiguation.
   */
  private generateRunId(profile: string, task: string): string {
    const slug = this.slugify(task);
    const timestamp = new Date().toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const suffix = randomUUID().slice(0, 6);
    return `${profile}-${slug}-${timestamp}-${suffix}`;
  }

  /**
   * Slugify a string for use in run IDs.
   *
   * Rules: lowercase, replace non-alphanumeric with `-`, collapse runs,
   * trim leading/trailing `-`.
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  // -----------------------------------------------------------------------
  // Policy
  // -----------------------------------------------------------------------

  /**
   * Load a merged policy from the project config and the profile's tools.
   *
   * 1. Read project-level policy (`.subagent/policy.yaml` or equivalent).
   * 2. If the profile specifies `tools`, merge them with the project policy
   *    (profile tools take precedence on conflict).
   * 3. Return the merged policy, or `null` if neither source provides rules.
   */
  private async loadMergedPolicy(
    cwd: string,
    profile: ProfileDefinition,
  ): Promise<Policy> {
    return loadProfilePolicy(cwd, profile.frontmatter.name);
  }

  // -----------------------------------------------------------------------
  // Profile entry registration
  // -----------------------------------------------------------------------

  /**
   * Register profile-defined placeholders and registry entries.
   *
   * Placeholders (`frontmatter.placeholders`) are bound via the prompt
   * engine's `registerPlaceholder()`, enabling `{{name}}` substitution at
   * render time.
   *
   * Registry entries (`frontmatter.registry`) are added to the core Registry
   * as `Entry` objects.  The profile frontmatter schema uses the computation
   * layer's shape (type, filePath, memberIds, lifecycle, etc.) which is
   * mapped to the core `EntryInput` shape here.
   */
  private registerProfileEntries(cwd: string, profile: ProfileDefinition): void {
    // Register placeholders.
    if (profile.frontmatter.placeholders) {
      for (const [name, filePath] of Object.entries(profile.frontmatter.placeholders)) {
        registerPlaceholder(name, resolve(cwd, filePath));
      }
    }

    // Register registry entries.
    if (profile.frontmatter.registry) {
      for (const entryInput of profile.frontmatter.registry) {
        const entryBase = {
          name: entryInput.name ?? entryInput.description.slice(0, 40),
          kind: this.mapEntryKind(entryInput.type),
          content: entryInput.content ?? entryInput.filePath ?? entryInput.description,
          description: entryInput.description,
          tags: entryInput.tags ?? [],
          group: entryInput.group ?? "",
          priority: entryInput.priority ?? 50,
          lifecycle: this.mapLifecycle({
            type: entryInput.lifecycle.type,
            ...(entryInput.lifecycle.maxRounds !== undefined ? { maxRounds: entryInput.lifecycle.maxRounds } : {}),
            ...(entryInput.lifecycle.validFrom !== undefined ? { validFrom: entryInput.lifecycle.validFrom } : {}),
            ...(entryInput.lifecycle.validUntil !== undefined ? { validUntil: entryInput.lifecycle.validUntil } : {}),
            createdAt: Date.now(),
          }),
        };
        const entry: EntryInput = entryInput.frequency
          ? { ...entryBase, frequency: entryInput.frequency as FrequencyGate }
          : entryBase;
        this.registry.add(entry, "persistent");
      }
    }
  }

  /**
   * Map a computation-layer entry type to a core `EntryKind`.
   *
   * | Computation type | Core kind    |
   * |------------------|--------------|
   * | `custom`         | `inline`     |
   * | `file`           | `file`       |
   * | `template`       | `inline`     |
   */
  private mapEntryKind(
    type: string | undefined,
  ): "inline" | "file" | "generator" {
    switch (type) {
      case "file":
        return "file";
      case "template":
      case "custom":
      default:
        return "inline";
    }
  }

  /**
   * Map a computation-layer lifecycle config to a core `Lifecycle`.
   */
  private mapLifecycle(lc: {
    readonly type: string;
    readonly maxRounds?: number;
    readonly validFrom?: number;
    readonly validUntil?: number;
    readonly createdAt: number;
  }): Lifecycle {
    switch (lc.type) {
      case "rounds":
        return { type: "rounds", maxRounds: lc.maxRounds ?? 1 };
      case "time-window":
        return {
          type: "time-window",
          start: new Date(lc.validFrom ?? Date.now()).toISOString(),
          end: new Date(lc.validUntil ?? Date.now() + 86400000).toISOString(),
        };
      case "session":
        return { type: "session" };
      case "permanent":
      default:
        return { type: "permanent" };
    }
  }

  // -----------------------------------------------------------------------
  // Action handlers
  // -----------------------------------------------------------------------

  /**
   * Handle a `tool_call` action.
   *
   * 1. Build an ActionContext from the tool name and args.
   * 2. Evaluate against the merged policy.
   * 3. If blocked: log a `policy_block` event.
   * 4. If allowed: log the call event, record the result, log the result.
   * 5. Capture any slot mutations from the prompt engine's event log.
   */
  private async handleToolCall(
    ctx: RunLoopContext,
    action: Action & { readonly type: "tool_call" },
    _index: number,
    _total: number,
  ): Promise<void> {
    const policyAction: PolicyAction = {
      type: action.tool,
      ...(action.args.path !== undefined ? { path: String(action.args.path) } : {}),
      ...(action.args.command !== undefined ? { command: String(action.args.command) } : {}),
      ...(action.args.url !== undefined ? { domain: String(action.args.url) } : {}),
    };

    const toolArgs: Record<string, unknown> = {};
    if (policyAction.path) toolArgs.path = policyAction.path;
    if (policyAction.command) toolArgs.command = policyAction.command;
    if (policyAction.domain) toolArgs.url = policyAction.domain;

    // Evaluate policy.
    const decision = evaluatePolicy(policyAction, ctx.policy);

    if (!decision.allowed) {
      await this.logEvent(ctx.runDir, ctx.runId, "policy_block", {
        tool: action.tool,
        reason: decision.reason,
        args: toolArgs,
      });
      return;
    }

    // Log tool call and result events.
    const output = `[simulated ${action.tool} output]`;

    await this.logEvent(ctx.runDir, ctx.runId, "tool_call", {
      tool: action.tool,
      args: toolArgs,
    });
    await this.logEvent(ctx.runDir, ctx.runId, "tool_result", {
      tool: action.tool,
      status: "ok",
      output,
    });

    // Capture slot mutations from the prompt engine.
    for (const change of getEventLog()) {
      await this.logEvent(ctx.runDir, ctx.runId, "slot_mutation", {
        operation: change.operation,
        slotName: change.slotName,
      });
    }
  }

  /**
   * Handle a `schedule` action by delegating to MountController.
   *
   * Supports scheduling by tags, explicit IDs, and/or group name.
   * The MountController's response (count of scheduled entries) is logged.
   */
  private async handleScheduleAction(
    ctx: RunLoopContext,
    action: Action & { readonly type: "schedule" },
  ): Promise<void> {
    const parts: string[] = [];

    if (action.tags && action.tags.length > 0) {
      const r = this.mountController.scheduleTags(action.tags);
      parts.push(`tags:${r.scheduled}`);
    }

    if (action.ids && action.ids.length > 0) {
      const r = this.mountController.scheduleIds(action.ids);
      parts.push(`ids:${r.scheduled}`);
    }

    if (action.group) {
      const r = this.mountController.scheduleGroup(action.group);
      parts.push(`group:${r.scheduled}`);
    }

    await this.logEvent(ctx.runDir, ctx.runId, "schedule", {
      tags: action.tags,
      ids: action.ids,
      group: action.group,
      scheduled: parts.join(", "),
    });
  }

  /**
   * Handle an `unschedule` action by delegating to MountController.
   *
   * Currently supports unscheduling by entry IDs.
   */
  private async handleUnscheduleAction(
    ctx: RunLoopContext,
    action: Action & { readonly type: "unschedule" },
  ): Promise<void> {
    const r = this.mountController.unscheduleIds(action.entryIds);

    await this.logEvent(ctx.runDir, ctx.runId, "unschedule", {
      entryIds: action.entryIds,
      removed: r.removed,
    });
  }

  // -----------------------------------------------------------------------
  // Artifacts
  // -----------------------------------------------------------------------

  /**
   * Produce handoff document and transcript for a run.
   *
   * Reads the run's event log, then delegates to `buildHandoff` and
   * `buildTranscript` from the storage layer (which in turn delegate
   * markdown formatting to `runtime/output.ts`).
   */
  private async produceArtifacts(
    ctx: RunLoopContext,
    runStatus: string,
    assembly?: ContextAssembly,
  ): Promise<ArtifactResult> {
    const events = await readEvents(ctx.runDir.dir);

    // Build the Run object for the formatters.
    const run: Run = {
      id: ctx.runId,
      profile: ctx.profile.frontmatter.name,
      task: ctx.profile.frontmatter.description || "run",
      startTime: "", // filled from session.json by caller if needed
      status: runStatus as Run["status"],
      directory: ctx.runDir.dir,
      isContinuation: ctx.isContinuation,
    };

    await buildHandoff(run, events, assembly);
    await buildTranscript(run, events);

    return {
      handoffPath: join(ctx.runDir.dir, "handoff.md"),
      transcriptPath: join(ctx.runDir.dir, "transcript.md"),
    };
  }

  // -----------------------------------------------------------------------
  // State persistence
  // -----------------------------------------------------------------------

  /**
   * Write the run's session state JSON file.
   */
  private async writeSessionState(
    runDir: RunDirectory,
    state: {
      runId: string;
      profile: string;
      task: string;
      status: string;
    },
  ): Promise<void> {
    await writeSession(runDir.dir, {
      ...state,
      startTime: new Date().toISOString(),
    });
  }

  /**
   * Read session state from a run directory.
   * Returns null if the file does not exist or is corrupt.
   */
  private async readSessionState(
    runDir: RunDirectory,
  ): Promise<{
    readonly profile?: string;
    readonly task?: string;
    readonly startTime?: string;
    readonly status?: string;
  } | null> {
    const session = await readSession(runDir.dir);
    if (!session) return null;
    return {
      ...(session.profile !== undefined ? { profile: String(session.profile) } : {}),
      ...(session.task !== undefined ? { task: String(session.task) } : {}),
      ...(session.startedAt !== undefined ? { startTime: String(session.startedAt) } : {}),
      ...(session.status !== undefined ? { status: String(session.status) } : {}),
    };
  }

  /**
   * Restore prompt engine slots from a prior run's serialised state.
   */
  private async restoreSlots(runDir: RunDirectory): Promise<void> {
    const slotsPath = join(runDir.dir, "slots.json");
    if (!existsSync(slotsPath)) return;

    try {
      const raw = await readFile(slotsPath, "utf-8");
      const data = JSON.parse(raw) as SerializedSlots;
      deserializeSlots(data);
    } catch {
      // Silently ignore corrupt slot state — non-fatal.
    }
  }

  // -----------------------------------------------------------------------
  // Logging
  // -----------------------------------------------------------------------

  /**
   * Append a structured event to the run's JSONL event log.
   */
  private async logEvent(
    runDir: RunDirectory,
    runId: string,
    eventType: string,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    await appendEvent(runDir.dir, {
      type: eventType,
      timestamp: new Date().toISOString(),
      data: { ...extra, runId },
    });
  }

  // -----------------------------------------------------------------------
  // Result builder
  // -----------------------------------------------------------------------

  /**
   * Build a RunResult from the final run state.
   */
  private buildResult(
    runId: string,
    status: string,
    _runDir: RunDirectory,
    artifacts: ArtifactResult,
    assembly?: ContextAssembly,
  ): RunResult {
    const output = status === "completed"
      ? "Run completed."
      : status === "timedout"
        ? "Run timed out."
        : "Run failed.";

    return {
      id: runId,
      status,
      handoffPath: artifacts.handoffPath,
      transcriptPath: artifacts.transcriptPath,
      output,
      ...(assembly !== undefined ? { assembly } : {}),
    };
  }
}

// ---------------------------------------------------------------------------
// Internal — RunLoopContext
// ---------------------------------------------------------------------------

/**
 * Context object passed through the action loop.
 *
 * Carries the run directory handle, identifiers, profile data, and the
 * merged policy.  Not exported — internal to RunLifecycle.
 */
interface RunLoopContext {
  readonly runDir: RunDirectory;
  readonly runId: string;
  readonly profile: ProfileDefinition;
  readonly policy: Policy | null;
  readonly isContinuation: boolean;
}
