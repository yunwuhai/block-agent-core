import { readFile } from "node:fs/promises";
import {
  appendSessionEvent,
  appendSessionFileCall,
  appendSessionMessage,
  appendSessionToolCall,
  compressMessageSequences,
  getCurrentParentSequence,
  listContextMounts,
  removeSessionFileCallsBySeq,
  removeSessionMessagesBySeq,
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
  requestKey?: string;
  inputText: string;
  inputSeq: number;
  parentSeq?: number;
  systemPromptSeqs: number[];
  temporarySources?: ContextSource[];
  metadata?: Record<string, unknown>;
}

export interface SessionTaskExecutionResult {
  requestKey?: string;
  model: PiSdkRunResult["model"];
  tools: string[];
  prompt: string;
  outputMessageSeqs: number[];
  activeMessageSeqs: number[];
}

export interface CreatedInputArtifacts {
  parentSeq?: number;
  systemPromptSeqs: number[];
  systemPromptFileCallSeqs: number[];
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
  toolCallsBySeq: Map<number, { toolName: string; params: unknown; result: unknown; error?: boolean }>,
  fileCallsBySeq: Map<number, SessionFileCallRecord>,
): string {
  if (message.kind === "tool_call" && typeof message.toolCallSeq === "number") {
    const toolCall = toolCallsBySeq.get(message.toolCallSeq);
    if (toolCall) {
      return formatToolCallMessage(toolCall);
    }
  }
  if (message.kind === "file_call" && typeof message.fileCallSeq === "number") {
    const fileCall = fileCallsBySeq.get(message.fileCallSeq);
    if (fileCall) {
      return formatFileCallMessage(fileCall);
    }
  }
  return message.text ?? "";
}

async function buildSessionHistoryContext(cwd: string, sessionId: string): Promise<{ text: string; activeMessageSeqs: number[] }> {
  const state = await readCurrentContextState(cwd, sessionId);
  if (state.activeMessageSeqs.length === 0) {
    return { text: "", activeMessageSeqs: [] };
  }
  const [messages, toolCalls, fileCalls] = await Promise.all([
    readMessages(cwd, sessionId),
    readToolCalls(cwd, sessionId),
    readFileCalls(cwd, sessionId),
  ]);
  const activeSet = new Set(state.activeMessageSeqs);
  const toolCallsBySeq = new Map(toolCalls.map(record => [record.seq, record]));
  const fileCallsBySeq = new Map(fileCalls.map(record => [record.seq, record]));
  const text = messages
    .filter(message => activeSet.has(message.seq))
    .sort((a, b) => a.seq - b.seq)
    .map(message => resolveExpandedMessageText(message, toolCallsBySeq, fileCallsBySeq))
    .filter(part => part.trim().length > 0)
    .join("\n\n");
  return { text, activeMessageSeqs: state.activeMessageSeqs };
}

export async function createInputMessage(
  cwd: string,
  sessionId: string,
  inputText: string,
  requestKey?: string,
  metadata?: Record<string, unknown>,
): Promise<CreatedInputArtifacts> {
  const config = await readSessionConfig(cwd, sessionId);
  let currentParentSeq = await getCurrentParentSequence(cwd, sessionId);
  const systemPromptSeqs: number[] = [];
  const systemPromptFileCallSeqs: number[] = [];

  for (const filePath of config.systemPromptFilePaths) {
    const text = await readFile(filePath, "utf-8");
    const fileCall = await appendSessionFileCall(cwd, sessionId, {
      filePath,
      ...(requestKey ? { requestKey } : {}),
      metadata: { kind: "system_prompt_source" },
    });
    systemPromptFileCallSeqs.push(fileCall.seq);
    const message = await appendSessionMessage(cwd, sessionId, {
      kind: "system_prompt",
      text,
      ...(currentParentSeq !== undefined ? { parentSeq: currentParentSeq } : {}),
      ...(requestKey ? { requestKey } : {}),
      fileCallSeq: fileCall.seq,
      metadata: { sourceFilePath: filePath },
    });
    systemPromptSeqs.push(message.seq);
    currentParentSeq = message.seq;
  }

  const inputMessage = await appendSessionMessage(cwd, sessionId, {
    kind: "input",
    text: inputText,
    ...(currentParentSeq !== undefined ? { parentSeq: currentParentSeq } : {}),
    ...(requestKey ? { requestKey } : {}),
    ...(metadata ? { metadata } : {}),
  });

  return {
    ...(inputMessage.parentSeq !== undefined ? { parentSeq: inputMessage.parentSeq } : {}),
    systemPromptSeqs,
    systemPromptFileCallSeqs,
    inputMessage,
  };
}

export async function rollbackCreatedInputArtifacts(
  cwd: string,
  sessionId: string,
  created: CreatedInputArtifacts,
): Promise<void> {
  await Promise.all([
    removeSessionMessagesBySeq(cwd, sessionId, [...created.systemPromptSeqs, created.inputMessage.seq]),
    removeSessionFileCallsBySeq(cwd, sessionId, created.systemPromptFileCallSeqs),
  ]);
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

  const systemPromptMessages = await readMessages(cwd, sessionId);
  const systemPromptText = systemPromptMessages
    .filter(message => request.systemPromptSeqs.includes(message.seq))
    .sort((a, b) => a.seq - b.seq)
    .map(message => message.text ?? "")
    .filter(Boolean)
    .join("\n\n");

  const context = [mountedContext, historyContext.text, temporaryContext]
    .filter(part => part.trim().length > 0)
    .join("\n\n");

  const sentMessageSeqs = [...request.systemPromptSeqs, ...historyContext.activeMessageSeqs, request.inputSeq];
  await appendSessionEvent(cwd, sessionId, {
    ...(request.requestKey ? { requestKey: request.requestKey } : {}),
    type: "send_started",
    payload: {
      inputSeq: request.inputSeq,
      ...(request.parentSeq !== undefined ? { parentSeq: request.parentSeq } : {}),
      systemPromptSeqRanges: compressMessageSequences(request.systemPromptSeqs),
      sentMessageSeqRanges: compressMessageSequences(sentMessageSeqs),
      activeMountIds: activeMounts.map(mount => mount.id),
    },
  });

  const result = await deps.runWithSdk({
    inputText: request.inputText,
    context,
    systemPrompt: systemPromptText,
    cwd,
    turnIdentity: {
      runId: sessionId,
      keyParts: [request.requestKey ?? `send-${request.inputSeq}`],
    },
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
        await appendSessionEvent(cwd, sessionId, {
          ...(request.requestKey ? { requestKey: request.requestKey } : {}),
          type: "tool_send_started",
          payload: event.payload,
        });
      }
      if (event.type === "tool_call_finished") {
        await appendSessionEvent(cwd, sessionId, {
          ...(request.requestKey ? { requestKey: request.requestKey } : {}),
          type: "tool_send_finished",
          payload: event.payload,
        });
      }
    },
  });

  const outputMessageSeqs: number[] = [];
  let currentParentSeq = request.inputSeq;

  const reasoningMessage = await appendSessionMessage(cwd, sessionId, {
    kind: "reasoning",
    text: result.reasoningText,
    parentSeq: currentParentSeq,
    ...(request.requestKey ? { requestKey: request.requestKey } : {}),
  });
  outputMessageSeqs.push(reasoningMessage.seq);
  currentParentSeq = reasoningMessage.seq;

  for (const trace of result.toolCalls) {
    const toolCallRecord = await appendSessionToolCall(cwd, sessionId, {
      toolName: trace.toolName,
      params: trace.params,
      result: trace.result,
      error: Boolean(trace.metadata?.isError),
      ...(request.requestKey ? { requestKey: request.requestKey } : {}),
      ...(trace.metadata ? { metadata: trace.metadata } : {}),
    });

    const toolCallMessage = await appendSessionMessage(cwd, sessionId, {
      kind: "tool_call",
      parentSeq: currentParentSeq,
      ...(request.requestKey ? { requestKey: request.requestKey } : {}),
      toolCallSeq: toolCallRecord.seq,
    });
    outputMessageSeqs.push(toolCallMessage.seq);
    currentParentSeq = toolCallMessage.seq;

    const filePath = inferFilePath(trace.params);
    if (filePath && isFileAccessTool(trace.toolName)) {
      const fileCallRecord = await appendSessionFileCall(cwd, sessionId, {
        filePath,
        ...(request.requestKey ? { requestKey: request.requestKey } : {}),
      });
      const fileCallMessage = await appendSessionMessage(cwd, sessionId, {
        kind: "file_call",
        parentSeq: currentParentSeq,
        ...(request.requestKey ? { requestKey: request.requestKey } : {}),
        fileCallSeq: fileCallRecord.seq,
      });
      outputMessageSeqs.push(fileCallMessage.seq);
      currentParentSeq = fileCallMessage.seq;
    }
  }

  const replyMessage = await appendSessionMessage(cwd, sessionId, {
    kind: "reply",
    text: result.replyText,
    parentSeq: currentParentSeq,
    ...(request.requestKey ? { requestKey: request.requestKey } : {}),
  });
  outputMessageSeqs.push(replyMessage.seq);

  const activeMessageSeqs = [...historyContext.activeMessageSeqs, request.inputSeq, ...outputMessageSeqs];

  return {
    ...(request.requestKey ? { requestKey: request.requestKey } : {}),
    model: result.model,
    tools: result.tools,
    prompt: result.prompt,
    outputMessageSeqs,
    activeMessageSeqs,
  };
}
