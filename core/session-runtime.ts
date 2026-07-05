import {
  appendSessionEvent,
  appendSessionFileCall,
  appendSessionMessage,
  appendSessionToolCall,
  compressMessageRanges,
  getCurrentParentSequence,
  listContextMounts,
  removeSessionMessagesById,
  readCurrentContextState,
  readFileCalls,
  readMessages,
  readSessionConfig,
  readToolCalls,
  type SessionFileCallRecord,
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

function isFileAccessTool(toolName: string): boolean {
  return toolName === "read" || toolName === "write" || toolName === "edit";
}

function inferFilePath(params: unknown): string | undefined {
  if (!params || typeof params !== "object") return undefined;
  const candidate = (params as Record<string, unknown>).path;
  return typeof candidate === "string" ? candidate : undefined;
}

function formatToolCallMessage(record: { toolName: string; params: unknown; result: unknown; error?: boolean }): string {
  return [
    `Tool: ${record.toolName}`,
    `Params: ${JSON.stringify(record.params, null, 2)}`,
    `Error: ${record.error ? "true" : "false"}`,
    `Result: ${JSON.stringify(record.result, null, 2)}`,
  ].join("\n");
}

function formatFileCallMessage(record: SessionFileCallRecord): string {
  return `File: ${record.filePath}`;
}

function resolveExpandedMessageText(
  message: SessionMessageRecord,
  toolCallsById: Map<number, { toolName: string; params: unknown; result: unknown; error?: boolean }>,
  fileCallsById: Map<number, SessionFileCallRecord>,
): string {
  if (message.kind === "tool_call" && typeof message.toolCallId === "number") {
    const toolCall = toolCallsById.get(message.toolCallSeq);
    if (toolCall) {
      return formatToolCallMessage(toolCall);
    }
  }
  if (message.kind === "file_call" && typeof message.fileCallId === "number") {
    const fileCall = fileCallsById.get(message.fileCallSeq);
    if (fileCall) {
      return formatFileCallMessage(fileCall);
    }
  }
  return message.text ?? "";
}

async function buildSessionHistoryContext(cwd: string, sessionId: string): Promise<{ text: string; activeMessageIds: number[] }> {
  const state = await readCurrentContextState(cwd, sessionId);
  if (state.activeMessageIds.length === 0) {
    return { text: "", activeMessageIds: [] };
  }
  const [messages, toolCalls, fileCalls] = await Promise.all([
    readMessages(cwd, sessionId),
    readToolCalls(cwd, sessionId),
    readFileCalls(cwd, sessionId),
  ]);
  const activeSet = new Set(state.activeMessageIds);
  const toolCallsById = new Map(toolCalls.map(record => [record.id, record]));
  const fileCallsById = new Map(fileCalls.map(record => [record.id, record]));
  const text = messages
    .filter(message => activeSet.has(message.id))
    .sort((a, b) => a.id - b.id)
    .map(message => resolveExpandedMessageText(message, toolCallsById, fileCallsById))
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
        pendingStarted.set(event.payload.toolCallId as string, event.payload);
      }
      if (event.type === "tool_call_finished") {
        pendingFinished.set(event.payload.toolCallId as string, event.payload);
      }
    },
  });

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

  const sdkToLocalId = new Map<string, number>();

  for (const trace of result.toolCalls) {
    const toolCallRecord = await appendSessionToolCall(cwd, sessionId, {
      toolName: trace.toolName,
      params: trace.params,
      result: trace.result,
      error: Boolean(trace.metadata?.isError),
      turnId: request.turnId,
      ...(trace.metadata ? { metadata: trace.metadata } : {}),
    });

    sdkToLocalId.set(trace.id, toolCallRecord.id);

    const toolCallMessage = await appendSessionMessage(cwd, sessionId, {
      kind: "tool_call",
      parentId: currentParentId,
      turnId: request.turnId,
      toolCallId: toolCallRecord.id,
    });
    outputMessageIds.push(toolCallMessage.id);
    currentParentId = toolCallMessage.id;

    const filePath = inferFilePath(trace.params);
    if (filePath && isFileAccessTool(trace.toolName)) {
      const fileCallRecord = await appendSessionFileCall(cwd, sessionId, {
        filePath,
        turnId: request.turnId,
      });
      const fileCallMessage = await appendSessionMessage(cwd, sessionId, {
        kind: "file_call",
        parentId: currentParentId,
        turnId: request.turnId,
        fileCallId: fileCallRecord.id,
      });
      outputMessageIds.push(fileCallMessage.id);
      currentParentId = fileCallMessage.id;
    }
  }

  // Write deferred tool events with only local tool call ids
  for (const [sdkId, _startedPayload] of pendingStarted) {
    const localId = sdkToLocalId.get(sdkId);
    if (localId !== undefined) {
      await appendSessionEvent(cwd, sessionId, {
        turnId: request.turnId,
        type: "tool_send_started",
        payload: { toolCallId: localId },
      });
    }
  }
  for (const [sdkId, _finishedPayload] of pendingFinished) {
    const localId = sdkToLocalId.get(sdkId);
    if (localId !== undefined) {
      await appendSessionEvent(cwd, sessionId, {
        turnId: request.turnId,
        type: "tool_send_finished",
        payload: { toolCallId: localId },
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
  };
}
