import {
  type ToolCallTrace,
} from "../core/archive-store.ts";
import { access, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildSubagentPrompt } from "../core/pi-config.ts";
import {
  composeSubagentTurnId,
  normalizeToolNames,
  type SubagentModelSelection,
  type SubagentRunRequest,
  type SubagentTurnIdentity,
} from "../core/subagent-run.ts";
import type { SessionSdkMode, StandaloneSdkOptions } from "../core/session-store.ts";

export interface PiModel {
  provider: string;
  id: string;
  name?: string;
  reasoning?: boolean;
  input: string[];
}

export interface ModelRegistry {
  getAll(): PiModel[];
  getAvailable(): PiModel[];
  find(provider: string, modelId: string): PiModel | undefined;
}

export type AuthStorage = unknown;
export type SettingsManager = unknown;
export type ResourceLoader = unknown;
export type ToolDefinition = unknown;

async function importPiCodingAgentSdk(sdkModulePath?: string): Promise<any> {
  if (sdkModulePath) {
    return import(pathToFileURL(sdkModulePath).href);
  }
  try {
    return await import("@earendil-works/pi-coding-agent");
  } catch (error) {
    const baseDir = join(homedir(), ".local", "share", "pi-node");
    const lastError = error as Error;

    try {
      const runtimeDirs = await readdir(baseDir, { withFileTypes: true });
      for (const entry of runtimeDirs) {
        if (!entry.isDirectory()) continue;
        const candidate = join(
          baseDir,
          entry.name,
          "lib",
          "node_modules",
          "@earendil-works",
          "pi-coding-agent",
          "dist",
          "index.js",
        );
        try {
          await access(candidate);
          return await import(pathToFileURL(candidate).href);
        } catch {
          // Continue scanning other PI runtime installations.
        }
      }
    } catch {
      // Fall through to the original import error below.
    }

    throw new Error(`Unable to load PI Coding Agent SDK: ${lastError.message}`);
  }
}

export interface PiModelSummary {
  provider: string;
  modelId: string;
  displayName: string;
  reasoning: boolean;
  input: string[];
  available: boolean;
}

export interface PiSdkRunOptions extends SubagentRunRequest {
  turnIdentity: SubagentTurnIdentity;
  agentDir?: string;
  authStorage?: AuthStorage;
  modelRegistry: ModelRegistry;
  currentModel?: PiModel;
  customTools?: ToolDefinition[];
  resourceLoader?: ResourceLoader;
  settingsManager?: SettingsManager;
  sdkMode?: SessionSdkMode;
  sdkOptions?: StandaloneSdkOptions;
  onEvent?: (event: { type: string; payload: Record<string, unknown> }) => void | Promise<void>;
}

export interface PiSdkRunResult {
  runId: string;
  turnId: string;
  model: PiModelSummary;
  tools: string[];
  prompt: string;
  reasoningText: string;
  replyText: string;
  toolCalls: ToolCallTrace[];
}

interface ToolExecutionStartLike {
  toolCallId: string;
  toolName: string;
  args: unknown;
}

interface ToolExecutionEndLike {
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError: boolean;
}

function toModelSummary(model: PiModel, available: boolean): PiModelSummary {
  return {
    provider: model.provider,
    modelId: model.id,
    displayName: model.name ?? model.id,
    reasoning: Boolean(model.reasoning),
    input: [...model.input],
    available,
  };
}

export function listPiModels(modelRegistry: ModelRegistry): {
  all: PiModelSummary[];
  available: PiModelSummary[];
} {
  const availableKeys = new Set(
    modelRegistry.getAvailable().map(model => `${model.provider}/${model.id}`),
  );
  const all = modelRegistry.getAll().map(model =>
    toModelSummary(model, availableKeys.has(`${model.provider}/${model.id}`)));
  const available = all.filter(model => model.available);
  return { all, available };
}

export function resolvePiModel(
  modelRegistry: ModelRegistry,
  currentModel: PiModel | undefined,
  selection: SubagentModelSelection | undefined,
): PiModel {
  const requested = selection ?? { strategy: "default" as const };

  if (requested.strategy === "current") {
    if (!currentModel) {
      throw new Error("No current PI model is active");
    }
    return currentModel;
  }

  if (requested.strategy === "specific") {
    const model = modelRegistry.find(requested.provider, requested.modelId);
    if (!model) {
      throw new Error(`Model not found: ${requested.provider}/${requested.modelId}`);
    }
    return model;
  }

  if (currentModel) {
    return currentModel;
  }

  const available = modelRegistry.getAvailable();
  if (available.length === 0) {
    throw new Error("No PI model with configured auth is available");
  }
  return available[0]!;
}

async function createStandaloneRuntime(
  sdkOptions: StandaloneSdkOptions | undefined,
  requestedModel: SubagentModelSelection | undefined,
): Promise<{ modelRegistry: ModelRegistry; currentModel?: PiModel; sdkModule: any }> {
  const sdkModule = await importPiCodingAgentSdk(sdkOptions?.sdkModulePath);
  const { AuthStorage, ModelRegistry } = sdkModule;
  if (!AuthStorage || !ModelRegistry) {
    throw new Error("Standalone SDK mode requires AuthStorage and ModelRegistry from the PI SDK");
  }
  if (!sdkOptions?.authStoragePath) {
    throw new Error("Standalone SDK mode requires sdkOptions.authStoragePath");
  }

  const authStorage = AuthStorage.create(sdkOptions.authStoragePath);
  authStorage.reload();
  const modelRegistry = ModelRegistry.create(authStorage);
  modelRegistry.refresh();

  const currentModel = sdkOptions.currentModel
    ? modelRegistry.find(sdkOptions.currentModel.provider, sdkOptions.currentModel.modelId)
    : (requestedModel?.strategy === "specific"
      ? modelRegistry.find(requestedModel.provider, requestedModel.modelId)
      : modelRegistry.getAvailable()[0]);

  return { modelRegistry, currentModel, sdkModule };
}

export async function importPiModelRegistryFromStandalone(
  sdkOptions: StandaloneSdkOptions | undefined,
): Promise<ModelRegistry> {
  const { modelRegistry } = await createStandaloneRuntime(sdkOptions, undefined);
  return modelRegistry;
}

function createToolTraceFromStart(event: ToolExecutionStartLike): ToolCallTrace {
  return {
    id: event.toolCallId,
    messageId: "",
    toolName: event.toolName,
    params: event.args,
    result: null,
  };
}

function finalizeToolTrace(
  trace: ToolCallTrace,
  event: ToolExecutionEndLike,
  messageId: string,
): ToolCallTrace {
  return {
    ...trace,
    messageId,
    result: event.result,
    metadata: { isError: event.isError },
  };
}

export async function runSubagentWithPiSdk(options: PiSdkRunOptions): Promise<PiSdkRunResult> {
  let runtimeModelRegistry = options.modelRegistry;
  let runtimeCurrentModel = options.currentModel;
  let pi = await importPiCodingAgentSdk(options.sdkOptions?.sdkModulePath);

  if (options.sdkMode === "standalone-sdk") {
    const standalone = await createStandaloneRuntime(options.sdkOptions, options.modelSelection);
    runtimeModelRegistry = standalone.modelRegistry;
    runtimeCurrentModel = standalone.currentModel;
    pi = standalone.sdkModule;
  }

  const { createAgentSession, SessionManager } = pi;
  const model = resolvePiModel(runtimeModelRegistry, runtimeCurrentModel, options.modelSelection);
  const tools = normalizeToolNames(options.tools);
  const turnId = composeSubagentTurnId(options.turnIdentity);
  const promptInput = {
    context: options.context ?? "",
    task: options.inputText,
  };
  const prompt = buildSubagentPrompt(
    options.systemPrompt
      ? { ...promptInput, systemPrompt: options.systemPrompt }
      : promptInput,
  );

  const sessionOptions = {
    modelRegistry: runtimeModelRegistry,
    model,
    tools,
    sessionManager: SessionManager.inMemory(),
  };
  const { session } = await createAgentSession({
    ...sessionOptions,
    ...(options.cwd ? { cwd: options.cwd } : {}),
    ...(options.agentDir ? { agentDir: options.agentDir } : {}),
    ...(options.authStorage ? { authStorage: options.authStorage } : {}),
    ...(options.customTools ? { customTools: options.customTools } : {}),
    ...(options.resourceLoader ? { resourceLoader: options.resourceLoader } : {}),
    ...(options.settingsManager ? { settingsManager: options.settingsManager } : {}),
  });

  let reasoningText = "";
  let replyText = "";
  const pendingToolCalls = new Map<string, ToolCallTrace>();
  const finishedToolCalls: ToolCallTrace[] = [];

  const unsubscribe = session.subscribe((event: any) => {
    if (event.type === "message_update") {
      if (event.assistantMessageEvent.type === "thinking_delta") {
        reasoningText += event.assistantMessageEvent.delta;
      }
      if (event.assistantMessageEvent.type === "text_delta") {
        replyText += event.assistantMessageEvent.delta;
      }
    }

    if (event.type === "tool_execution_start") {
      pendingToolCalls.set(event.toolCallId, createToolTraceFromStart(event));
      void options.onEvent?.({
        type: "tool_call_started",
        payload: {
          turnId,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          params: event.args ?? {},
        },
      });
    }

    if (event.type === "tool_execution_end") {
      const existing = pendingToolCalls.get(event.toolCallId) ?? createToolTraceFromStart({
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args: {},
      });
      finishedToolCalls.push(finalizeToolTrace(existing, event, `${turnId}:reply`));
      pendingToolCalls.delete(event.toolCallId);
      void options.onEvent?.({
        type: "tool_call_finished",
        payload: {
          turnId,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          result: event.result ?? null,
          isError: event.isError,
        },
      });
    }
  });

  try {
    await session.prompt(prompt);
  } finally {
    unsubscribe();
    session.dispose();
  }

  return {
    runId: options.turnIdentity.runId,
    turnId,
    model: toModelSummary(model, true),
    tools,
    prompt,
    reasoningText,
    replyText,
    toolCalls: finishedToolCalls,
  };
}
