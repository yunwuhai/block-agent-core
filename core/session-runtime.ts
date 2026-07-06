import {
  appendSessionEvent,
  appendSessionMessage,
  compressMessageRanges,
  getCurrentParentSequence,
  listContextMounts,
  removeSessionMessagesById,
  readCurrentContextState,
  readMessages,
  readSessionConfig,
  type SessionMessageRecord,
} from "./session-store.ts";
import { composeContext, type ContextSource } from "./context-sources.ts";
import { runSubagentWithPiSdk, type PiSdkRunOptions, type PiSdkRunResult } from "../adapter/pi-sdk.ts";
import type { ExtensionContextLike } from "../tool/shared.ts";

export interface SessionTaskRunnerResult extends PiSdkRunResult {}

export interface SessionTaskRunnerDeps {
  composeContextText: (sources: ContextSource[], separator?: string) => Promise<string>;
  runWithSdk: (options: PiSdkRunOptions) => Promise<PiSdkRunResult>;
}

export interface SessionSendRequest {
  turnId: number;
  inputText: string;
  inputId: number;
  parentId?: number;
  temporarySources?: ContextSource[];
  metadata?: Record<string, unknown>;
}

export interface SessionTaskExecutionResult {
  turnId: number;
  model: PiSdkRunResult["model"];
  tools: string[];
  prompt: string;
  outputMessageIds: number[];
  activeMessageIds: number[];
  usage?: PiSdkRunResult["usage"];
  durationMs: number;
}

export interface CreatedInputArtifacts {
  turnId: number;
  parentId?: number;
  inputMessage: SessionMessageRecord;
}

const defaultDeps: SessionTaskRunnerDeps = {
  composeContextText: (sources, separator) => composeContext(sources, undefined, separator),
  runWithSdk: runSubagentWithPiSdk,
};

function formatToolCallMessage(toolName: string, params: unknown, result: unknown, error?: boolean): string {
  return [
    `Tool: ${toolName}`,
    `Params: ${JSON.stringify(params, null, 2)}`,
    `Error: ${error ? "true" : "false"}`,
    `Result: ${JSON.stringify(result, null, 2)}`,
  ].join("\n");
}

function resolveExpandedMessageText(message: SessionMessageRecord): string {
  if (message.kind === "tool_call" && message.toolName) {
    return formatToolCallMessage(
      message.toolName,
      message.toolParams ?? {},
      message.toolResult ?? null,
      message.toolError,
    );
  }
  return message.text ?? "";
}

async function buildSessionHistoryContext(cwd: string, sessionId: string): Promise<{ text: string; activeMessageIds: number[] }> {
  const state = await readCurrentContextState(cwd, sessionId);
  if (state.activeMessageIds.length === 0) {
    return { text: "", activeMessageIds: [] };
  }
  const messages = await readMessages(cwd, sessionId);
  const activeSet = new Set(state.activeMessageIds);
  const text = messages
    .filter(message => activeSet.has(message.id))
    .sort((a, b) => a.id - b.id)
    .map(message => resolveExpandedMessageText(message))
    .filter(part => part.trim().length > 0)
    .join("\n\n");
  return { text, activeMessageIds: state.activeMessageIds };
}

export async function createInputMessage(
  cwd: string,
  sessionId: string,
  inputText: string,
  turnId: number,
  metadata?: Record<string, unknown>,
): Promise<CreatedInputArtifacts> {
  const parentId = await getCurrentParentSequence(cwd, sessionId);

  const inputMessage = await appendSessionMessage(cwd, sessionId, {
    turnId,
    kind: "input",
    text: inputText,
    ...(parentId !== undefined ? { parentId } : {}),
    ...(metadata ? { metadata } : {}),
  });

  return {
    turnId,
    ...(inputMessage.parentId !== undefined ? { parentId: inputMessage.parentId } : {}),
    inputMessage,
  };
}

export async function rollbackCreatedInputArtifacts(
  cwd: string,
  sessionId: string,
  created: CreatedInputArtifacts,
): Promise<void> {
  await removeSessionMessagesById(cwd, sessionId, [created.inputMessage.id]);
}

export async function executeSessionTask(
  cwd: string,
  sessionId: string,
  request: SessionSendRequest,
  ctx: ExtensionContextLike,
  deps: SessionTaskRunnerDeps = defaultDeps,
): Promise<SessionTaskExecutionResult> {
  const startedAt = Date.now();
  const config = await readSessionConfig(cwd, sessionId);
  const activeMounts = await listContextMounts(cwd, sessionId);

  const [mountedContext, historyContext, temporaryContext] = await Promise.all([
    deps.composeContextText(
      activeMounts
        .filter(mount => mount.sources?.length)
        .flatMap(mount => mount.sources ?? []),
      "\n\n",
    ),
    buildSessionHistoryContext(cwd, sessionId),
    request.temporarySources?.length ? deps.composeContextText(request.temporarySources, "\n\n") : Promise.resolve(""),
  ]);

  const systemPromptText = config.systemPromptText;

  const context = [mountedContext, historyContext.text, temporaryContext]
    .filter(part => part.trim().length > 0)
    .join("\n\n");

  const sentMessageIds = [...historyContext.activeMessageIds, request.inputId];
  await appendSessionEvent(cwd, sessionId, {
    turnId: request.turnId,
    type: "send_started",
    payload: {
      inputId: request.inputId,
      ...(request.parentId !== undefined ? { parentId: request.parentId } : {}),
      sentMessageIdRanges: compressMessageRanges(sentMessageIds),
      activeMountIds: activeMounts.map(mount => mount.id),
    },
  });

  const pendingStarted = new Map<string, Record<string, unknown>>();
  const pendingFinished = new Map<string, Record<string, unknown>>();
  const toolStartedAt = new Map<string, string>();

  const result = await deps.runWithSdk({
    inputText: request.inputText,
    context,
    systemPrompt: systemPromptText,
    cwd,
    runId: sessionId,
    ...(ctx.authStorage ? { authStorage: ctx.authStorage } : {}),
    ...(ctx.piSdkModule ? { piSdkModule: ctx.piSdkModule } : {}),
    modelRegistry: ctx.modelRegistry,
    ...(ctx.model ? { currentModel: ctx.model } : {}),
    ...(config.modelSelection ? { modelSelection: config.modelSelection } : {}),
    ...(config.tools ? { tools: config.tools } : {}),
    sdkMode: config.sdkMode,
    ...(config.sdkOptions ? { sdkOptions: config.sdkOptions } : {}),
    onEvent: async (event) => {
      if (event.type === "tool_call_started") {
        const sdkId = event.payload.toolCallId as string;
        pendingStarted.set(sdkId, event.payload);
        toolStartedAt.set(sdkId, new Date().toISOString());
      }
      if (event.type === "tool_call_finished") {
        pendingFinished.set(event.payload.toolCallId as string, event.payload);
      }
    },
  });

  const durationMs = Date.now() - startedAt;

  const outputMessageIds: number[] = [];
  let currentParentId = request.inputId;

  const reasoningMessage = await appendSessionMessage(cwd, sessionId, {
    kind: "reasoning",
    text: result.reasoningText,
    parentId: currentParentId,
    turnId: request.turnId,
  });
  outputMessageIds.push(reasoningMessage.id);
  currentParentId = reasoningMessage.id;

  const sdkToMessageId = new Map<string, number>();
  const toolTimingMap = new Map<string, { startedAt: string | undefined; finishedAt: string }>();

  for (const trace of result.toolCalls) {
    const isError = Boolean(trace.metadata?.isError);
    const startedAt = toolStartedAt.get(trace.id);
    const finishedAt = new Date().toISOString();
    toolTimingMap.set(trace.id, { startedAt, finishedAt });

    const toolCallMessage = await appendSessionMessage(cwd, sessionId, {
      kind: "tool_call",
      parentId: currentParentId,
      turnId: request.turnId,
      toolName: trace.toolName,
      toolParams: trace.params,
      toolResult: trace.result,
      toolError: isError,
      ...(trace.metadata ? { metadata: trace.metadata } : {}),
    });
    sdkToMessageId.set(trace.id, toolCallMessage.id);
    outputMessageIds.push(toolCallMessage.id);
    currentParentId = toolCallMessage.id;
  }

  // Write deferred tool events referencing messageId instead of toolCallId
  for (const [sdkId, startedPayload] of pendingStarted) {
    const messageId = sdkToMessageId.get(sdkId);
    if (messageId !== undefined) {
      await appendSessionEvent(cwd, sessionId, {
        turnId: request.turnId,
        type: "tool_send_started",
        payload: {
          messageId,
          toolName: startedPayload.toolName,
        },
      });
    }
  }
  for (const [sdkId, finishedPayload] of pendingFinished) {
    const messageId = sdkToMessageId.get(sdkId);
    const timing = toolTimingMap.get(sdkId);
    if (messageId !== undefined) {
      await appendSessionEvent(cwd, sessionId, {
        turnId: request.turnId,
        type: "tool_send_finished",
        payload: {
          messageId,
          toolName: finishedPayload.toolName,
          isError: finishedPayload.isError,
          ...(timing?.startedAt ? { startedAt: timing.startedAt } : {}),
          finishedAt: timing?.finishedAt ?? new Date().toISOString(),
        },
      });
    }
  }

  const replyMessage = await appendSessionMessage(cwd, sessionId, {
    kind: "reply",
    text: result.replyText,
    parentId: currentParentId,
    turnId: request.turnId,
  });
  outputMessageIds.push(replyMessage.id);

  const activeMessageIds = [...historyContext.activeMessageIds, request.inputId, ...outputMessageIds];

  return {
    turnId: request.turnId,
    model: result.model,
    tools: result.tools,
    prompt: result.prompt,
    outputMessageIds,
    activeMessageIds,
    usage: result.usage,
    durationMs,
  };
}
