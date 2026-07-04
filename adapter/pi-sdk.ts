import {
  createArchiveLayout,
  saveSubagentResult,
  type ArchiveLayout,
  type ToolCallTrace,
} from "../core/archive-store.ts";
import { buildSubagentPrompt } from "../core/pi-config.ts";
import {
  composeSubagentTurnId,
  normalizeToolNames,
  type SubagentModelSelection,
  type SubagentRunRequest,
  type SubagentTurnIdentity,
} from "../core/subagent-run.ts";

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
  archiveRootDir?: string;
  agentDir?: string;
  authStorage?: AuthStorage;
  modelRegistry: ModelRegistry;
  currentModel?: PiModel;
  customTools?: ToolDefinition[];
  resourceLoader?: ResourceLoader;
  settingsManager?: SettingsManager;
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
  archiveLayout?: ArchiveLayout;
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
  const pi = await import("@earendil-works/pi-coding-agent") as any;
  const { createAgentSession, SessionManager } = pi;
  const model = resolvePiModel(options.modelRegistry, options.currentModel, options.modelSelection);
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
    modelRegistry: options.modelRegistry,
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
    }

    if (event.type === "tool_execution_end") {
      const existing = pendingToolCalls.get(event.toolCallId) ?? createToolTraceFromStart({
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args: {},
      });
      finishedToolCalls.push(finalizeToolTrace(existing, event, `${turnId}:reply`));
      pendingToolCalls.delete(event.toolCallId);
    }
  });

  try {
    await session.prompt(prompt);
  } finally {
    unsubscribe();
    session.dispose();
  }

  let archiveLayout: ArchiveLayout | undefined;
  if (options.archiveRootDir) {
    archiveLayout = createArchiveLayout(options.archiveRootDir);
    await saveSubagentResult(archiveLayout, {
      messages: [
        { id: `${turnId}:reasoning`, kind: "reasoning", text: reasoningText, sequence: 1 },
        { id: `${turnId}:reply`, kind: "reply", text: replyText, sequence: 2 },
      ],
      toolCalls: finishedToolCalls,
    });
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
    ...(archiveLayout ? { archiveLayout } : {}),
  };
}
