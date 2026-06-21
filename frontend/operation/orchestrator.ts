import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { ActionParams, ProfileDefinition, ToolParams } from "../../backend/input/mod.ts";
import { loadProfile } from "../../backend/input/profile-loader.ts";
import { loadProjectPolicy } from "../../backend/input/project-loader.ts";
import { toPolicyEntry } from "../../backend/computation/policy/mod.ts";
import type { MergedPolicy, PolicyEntry } from "../../backend/computation/policy/mod.ts";
import { mergePolicies } from "../../backend/computation/policy/merge.ts";
import type { ActionContext } from "../../backend/computation/policy/evaluator.ts";
import { ScheduleOrchestrator } from "../../backend/computation/registry/orchestration.ts";
import { RegistryStorage } from "../../backend/computation/registry/storage.ts";
import type { RunContext as RegistryRunContext } from "../../backend/computation/registry/types.ts";
import type { RunDirectory } from "../../backend/storage/mod.ts";
import {
  appendEvent,
  appendSession,
  createRunDir,
  generateRunArtifacts,
  generateRunId,
  readEvents,
  readRunProfile,
  sessionExists,
} from "../../backend/storage/mod.ts";
import type { GenerateRunArtifactsResult } from "../../backend/storage/mod.ts";
import {
  deserializeSlots,
  registerPlaceholder,
  renderPromptWithRegistry,
  serializeSlots,
  setRegistry,
} from "../../backend/computation/prompt/engine.ts";
import type { SerializedSlots } from "../../backend/computation/prompt/engine.ts";
import { executeWithRetry } from "./tool-simulator.ts";
import type { FrequencyConfig } from "../../backend/computation/registry/types.ts";

type ProfileRegistryFrequency = NonNullable<NonNullable<ProfileDefinition["frontmatter"]["registry"]>[number]["frequency"]>;

const DEFAULT_RUN_TIMEOUT_MS = 5 * 60 * 1000;

export interface RunContext {
  readonly cwd: string;
  readonly params: ToolParams;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export interface RunResult {
  readonly runId: string;
  readonly status: "completed" | "failed" | "blocked";
  readonly handoffPath: string;
  readonly runDir: RunDirectory;
  readonly output: string;
  readonly transcript?: string;
  readonly transcriptPath?: string;
}

type RunStatus = RunResult["status"];

interface RunIdentity {
  readonly baseRunId: string;
  readonly isContinuation: boolean;
  readonly runId: string;
}

interface RunTiming {
  readonly signal: AbortSignal;
  readonly timeoutId: ReturnType<typeof setTimeout>;
}

interface ActionLoopInput {
  readonly run: RunDirectory;
  readonly runId: string;
  readonly policy: MergedPolicy;
  readonly actions: readonly ActionContext[];
  readonly signal: AbortSignal;
}

export async function executeRun(ctx: RunContext): Promise<RunResult> {
  const timing = createRunTiming(ctx);

  if (timing.signal.aborted) {
    clearTimeout(timing.timeoutId);
    throw new Error("Run aborted before start");
  }

  try {
    return await executeRunWithSignal(ctx, timing.signal);
  } finally {
    clearTimeout(timing.timeoutId);
  }
}

async function executeRunWithSignal(
  ctx: RunContext,
  effectiveSignal: AbortSignal,
): Promise<RunResult> {
  let status: RunStatus = "completed";
  const identity = await resolveRunIdentity(ctx);
  const run = await createRunDir(ctx.cwd, identity.runId, ctx.params.profile, ctx.params.task);
  const registryStorage = await initializeRegistry(ctx.cwd, run);

  await writeRunningSessionState(run, identity.runId, ctx.params);
  await appendRunCreatedEvent(run, identity);
  await recordProfileMismatch(ctx, run, identity);
  await restoreSlotsOnContinuation(run, identity.isContinuation);

  const profile = await loadRunProfile(ctx);
  assertRunNotAborted(effectiveSignal, "Run aborted after profile load");

  const policy = await loadMergedPolicy(ctx, profile);

  registerProfilePlaceholders(ctx.cwd, profile);
  registerProfileRegistryEntries(ctx.cwd, profile, registryStorage);

  const registryRunCtx: RegistryRunContext = { runId: identity.runId, roundNumber: 0, cwd: ctx.cwd };
  const fullPrompt = await renderPromptWithRegistry(profile.prompt, registryRunCtx);
  await appendRunStartEvent(run, identity.runId, ctx.params);
  await appendSession(run, {
    timestamp: isoNow(),
    runId: identity.runId,
    event: "message",
    role: "user",
    content: fullPrompt,
  });

  status = await executeActionLoop({
    run,
    runId: identity.runId,
    policy,
    actions: buildActionContexts(ctx.params.actions),
    signal: effectiveSignal,
  });

  const artifacts = await createArtifacts(ctx, run, identity, status);
  await appendRunEndEvent(run, identity.runId, status);
  await writeFinalSessionState(run, identity.runId, ctx.params, status);
  await persistSlots(run);
  await persistRegistry(registryStorage);

  return buildRunResult(run, identity.runId, status, artifacts);
}

function createRunTiming(ctx: RunContext): RunTiming {
  const runTimeoutMs = ctx.timeoutMs ?? DEFAULT_RUN_TIMEOUT_MS;
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort(new Error(`Run timed out after ${runTimeoutMs}ms`));
  }, runTimeoutMs);

  const sourceSignal = ctx.signal;
  if (sourceSignal) {
    if (sourceSignal.aborted) {
      abortController.abort(sourceSignal.reason);
    } else {
      sourceSignal.addEventListener("abort", () => {
        abortController.abort(sourceSignal.reason);
      }, { once: true });
    }
  }

  return { signal: abortController.signal, timeoutId };
}

async function resolveRunIdentity(ctx: RunContext): Promise<RunIdentity> {
  const requestedRunId = ctx.params.runId;
  const baseRunId = requestedRunId ?? generateRunId();
  const isContinuation = requestedRunId ? await sessionExists(ctx.cwd, requestedRunId) : false;
  const runId = isContinuation ? `${baseRunId}-cont${Date.now().toString(36)}` : baseRunId;
  return { baseRunId, isContinuation, runId };
}

async function initializeRegistry(cwd: string, run: RunDirectory): Promise<RegistryStorage> {
  const registryPath = resolve(cwd, "registry.jsonl");
  const registryStorage = new RegistryStorage(registryPath);
  await registryStorage.load();
  const registryOrchestrator = new ScheduleOrchestrator(registryStorage);
  registryStorage.setCallsPath(join(run.dir, "registry-calls.jsonl"));
  setRegistry(registryStorage, registryOrchestrator);
  return registryStorage;
}

async function writeRunningSessionState(
  run: RunDirectory,
  runId: string,
  params: ToolParams,
): Promise<void> {
  await writeFile(run.sessionStatePath, JSON.stringify({
    runId,
    startedAt: new Date().toISOString(),
    status: "running",
    profile: params.profile,
    task: params.task,
  }) + "\n", "utf-8");
}

async function appendRunCreatedEvent(run: RunDirectory, identity: RunIdentity): Promise<void> {
  await appendEvent(run, {
    timestamp: isoNow(),
    runId: identity.runId,
    event: identity.isContinuation ? "run_continue" : "run_created",
    continuation: identity.isContinuation,
  });
}

async function recordProfileMismatch(
  ctx: RunContext,
  run: RunDirectory,
  identity: RunIdentity,
): Promise<void> {
  const requestedRunId = ctx.params.runId;
  if (!identity.isContinuation || !requestedRunId) return;

  const originalProfile = await readRunProfile(ctx.cwd, requestedRunId);
  if (originalProfile && originalProfile !== ctx.params.profile) {
    await appendEvent(run, {
      timestamp: isoNow(),
      runId: identity.runId,
      event: "profile_mismatch",
      originalProfile,
      newProfile: ctx.params.profile,
    });
  }
}

async function restoreSlotsOnContinuation(
  run: RunDirectory,
  isContinuation: boolean,
): Promise<void> {
  if (!isContinuation) return;

  try {
    const slotsPath = join(run.dir, "slots.json");
    const raw = await readFile(slotsPath, "utf-8");
    const data = JSON.parse(raw) as SerializedSlots;
    deserializeSlots(data);
  } catch (err) {
    stringifyUnknownError(err);
  }
}

async function loadRunProfile(ctx: RunContext): Promise<ProfileDefinition> {
  try {
    return await loadProfile(ctx.cwd, ctx.params.profile);
  } catch (err) {
    const message = stringifyUnknownError(err);
    throw new Error(`Failed to load profile "${ctx.params.profile}": ${message}`);
  }
}

async function loadMergedPolicy(
  ctx: RunContext,
  profile: ProfileDefinition,
): Promise<MergedPolicy> {
  const rawProjectPolicy = await loadProjectPolicy(ctx.cwd);
  const projectPolicy: PolicyEntry | null = rawProjectPolicy !== null ? toPolicyEntry(rawProjectPolicy) : null;

  if (profile.frontmatter.tools && profile.frontmatter.tools.length > 0) {
    return mergePolicies(projectPolicy, { tools: profile.frontmatter.tools });
  }
  return mergePolicies(projectPolicy);
}

function registerProfilePlaceholders(cwd: string, profile: ProfileDefinition): void {
  if (!profile.frontmatter.placeholders) return;

  for (const [name, filePath] of Object.entries(profile.frontmatter.placeholders)) {
    registerPlaceholder(name, resolve(cwd, filePath));
  }
}

function registerProfileRegistryEntries(
  cwd: string,
  profile: ProfileDefinition,
  registryStorage: RegistryStorage,
): void {
  if (!profile.frontmatter.registry) return;

  for (const entryInput of profile.frontmatter.registry) {
    registryStorage.registerIfNew({
      type: entryInput.type,
      description: entryInput.description,
      ...(entryInput.content !== undefined ? { content: entryInput.content } : {}),
      ...(entryInput.filePath !== undefined ? { filePath: resolve(cwd, entryInput.filePath) } : {}),
      ...(entryInput.memberIds !== undefined ? { memberIds: entryInput.memberIds } : {}),
      ...(entryInput.name !== undefined ? { name: entryInput.name } : {}),
      tags: entryInput.tags,
      ...(entryInput.group !== undefined ? { group: entryInput.group } : {}),
      priority: entryInput.priority,
      lifecycle: {
        type: entryInput.lifecycle.type,
        createdAt: Date.now(),
        ...(entryInput.lifecycle.maxRounds !== undefined ? { maxRounds: entryInput.lifecycle.maxRounds } : {}),
        ...(entryInput.lifecycle.validFrom !== undefined ? { validFrom: entryInput.lifecycle.validFrom } : {}),
        ...(entryInput.lifecycle.validUntil !== undefined ? { validUntil: entryInput.lifecycle.validUntil } : {}),
      },
      ...normalizeFrequency(entryInput.frequency),
      createdBy: "user",
    });
  }
}

function normalizeFrequency(frequency: ProfileRegistryFrequency | undefined): { frequency?: FrequencyConfig } {
  if (frequency === undefined) return {};
  const normalized: FrequencyConfig = {
    ...(frequency.maxTotal !== undefined ? { maxTotal: frequency.maxTotal } : {}),
    ...(frequency.maxPer100 !== undefined ? { maxPer100: frequency.maxPer100 } : {}),
    ...(frequency.maxPer50 !== undefined ? { maxPer50: frequency.maxPer50 } : {}),
    ...(frequency.maxPer25 !== undefined ? { maxPer25: frequency.maxPer25 } : {}),
  };
  return { frequency: normalized };
}

async function appendRunStartEvent(
  run: RunDirectory,
  runId: string,
  params: ToolParams,
): Promise<void> {
  await appendEvent(run, {
    timestamp: isoNow(),
    runId,
    event: "run_start",
    profile: params.profile,
    task: params.task,
  });
}

function buildActionContexts(actions: readonly ActionParams[] | undefined): ActionContext[] {
  return actions && actions.length > 0
    ? actions.map(toActionContext)
    : [{ toolName: "read", filePath: "file.txt" }];
}

function toActionContext(action: ActionParams): ActionContext {
  const result: { toolName: string; filePath?: string; command?: string; url?: string; envVar?: string } = { toolName: action.toolName };
  if (action.filePath !== undefined) result.filePath = action.filePath;
  if (action.command !== undefined) result.command = action.command;
  if (action.url !== undefined) result.url = action.url;
  if (action.envVar !== undefined) result.envVar = action.envVar;
  return result;
}

async function executeActionLoop(input: ActionLoopInput): Promise<RunStatus> {
  let status: RunStatus = "completed";

  for (let i = 0; i < input.actions.length; i++) {
    const actionCtx = input.actions[i];
    if (!actionCtx) continue;

    if (input.signal.aborted) {
      return "blocked";
    }

    try {
      const toolResult = await executeWithRetry(
        input.run,
        input.runId,
        input.policy,
        actionCtx,
        input.signal,
      );

      await appendSession(input.run, {
        timestamp: isoNow(),
        runId: input.runId,
        event: "message",
        role: "assistant",
        content: toolResult.output,
      });

      if (toolResult.blocked) {
        return "blocked";
      }
    } catch (err) {
      if (input.signal.aborted) {
        return "blocked";
      }
      status = "failed";
      await appendSession(input.run, {
        timestamp: isoNow(),
        runId: input.runId,
        event: "message",
        role: "assistant",
        content: `[action ${i + 1}/${input.actions.length} failed] ${stringifyUnknownError(err)}`,
      });
    }
  }

  return status;
}

async function createArtifacts(
  ctx: RunContext,
  run: RunDirectory,
  identity: RunIdentity,
  status: RunStatus,
): Promise<GenerateRunArtifactsResult> {
  const accomplished = [`Loaded profile "${ctx.params.profile}"`];
  if (identity.isContinuation) {
    accomplished.push("Resumed prior session");
  }
  accomplished.push("Executed configured action sequence");
  const eventCount = (await readEvents(run)).length + 1;

  return generateRunArtifacts(run, {
    runId: identity.runId,
    profile: ctx.params.profile,
    task: ctx.params.task,
    status,
    exitCode: status === "completed" ? 0 : 1,
    isContinuation: identity.isContinuation,
    eventCount,
    accomplished,
    includeToolAccomplishments: true,
    pending: status === "blocked" ? ["Resolve policy block and retry"] : [],
  });
}

async function appendRunEndEvent(
  run: RunDirectory,
  runId: string,
  status: RunStatus,
): Promise<void> {
  await appendEvent(run, {
    timestamp: isoNow(),
    runId,
    event: "run_end",
    status,
    exitCode: status === "completed" ? 0 : 1,
  });
}

async function writeFinalSessionState(
  run: RunDirectory,
  runId: string,
  params: ToolParams,
  status: RunStatus,
): Promise<void> {
  await writeFile(run.sessionStatePath, JSON.stringify({
    runId,
    startedAt: new Date().toISOString(),
    status,
    profile: params.profile,
    task: params.task,
    endedAt: isoNow(),
  }) + "\n", "utf-8");
}

async function persistSlots(run: RunDirectory): Promise<void> {
  try {
    const serialized = serializeSlots();
    await writeFile(join(run.dir, "slots.json"), JSON.stringify(serialized) + "\n", "utf-8");
  } catch (err) {
    stringifyUnknownError(err);
  }
}

async function persistRegistry(registryStorage: RegistryStorage): Promise<void> {
  try {
    await registryStorage.save();
  } catch (err) {
    stringifyUnknownError(err);
  }
}

function buildRunResult(
  run: RunDirectory,
  runId: string,
  status: RunStatus,
  artifacts: GenerateRunArtifactsResult,
): RunResult {
  const output = status === "completed"
    ? "Run completed."
    : status === "blocked"
      ? "Run blocked."
      : "Run failed.";

  return {
    runId,
    status,
    handoffPath: artifacts.handoffPath,
    runDir: run,
    output,
    ...(artifacts.transcriptMarkdown !== undefined ? { transcript: artifacts.transcriptMarkdown } : {}),
    ...(artifacts.transcriptPath !== undefined ? { transcriptPath: artifacts.transcriptPath } : {}),
  };
}

function assertRunNotAborted(signal: AbortSignal, message: string): void {
  if (signal.aborted) {
    throw new Error(message);
  }
}

function stringifyUnknownError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isoNow(): string {
  return new Date().toISOString();
}
