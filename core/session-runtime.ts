import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import {
  appendSessionEvent,
  appendSessionFileCall,
  appendSessionMessage,
  appendSessionToolCall,
  createSessionLayout,
  getNextMessageSequence,
  readFileCalls,
  readMessages,
  readSessionConfig,
  readToolCalls,
  type SessionFileCallRecord,
  type SessionMessageRecord,
  type SessionTaskRecord,
} from "./session-store.ts";
import { composeContext, type ContextSource } from "./context-sources.ts";
import { runSubagentWithPiSdk, type PiSdkRunOptions, type PiSdkRunResult } from "../adapter/pi-sdk.ts";
import type { ExtensionContextLike } from "../tool/shared.ts";

export interface SessionTaskRunnerResult extends PiSdkRunResult {}

export interface SessionTaskRunnerDeps {
  composeContextText: (sources: ContextSource[], separator?: string) => Promise<string>;
  runWithSdk: (options: PiSdkRunOptions) => Promise<PiSdkRunResult>;
}

export interface SessionTaskExecutionResult {
  taskId: string;
  model: PiSdkRunResult["model"];
  tools: string[];
  prompt: string;
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

function formatToolCallRecord(record: { toolName: string; params: unknown; result: unknown }): string {
  return [
    `Tool: ${record.toolName}`,
    `Params: ${JSON.stringify(record.params, null, 2)}`,
    `Result: ${JSON.stringify(record.result, null, 2)}`,
  ].join("\n");
}

function formatFileCallRecord(record: SessionFileCallRecord): string {
  return [
    `File: ${record.filePath}`,
    `Access: ${record.accessType}`,
    ...(record.toolCallId ? [`ToolCall: ${record.toolCallId}`] : []),
  ].join("\n");
}

function resolveExpandedMessageText(
  message: SessionMessageRecord,
  toolCallsById: Map<string, { toolName: string; params: unknown; result: unknown }>,
  fileCallsById: Map<string, SessionFileCallRecord>,
): string {
  if (message.kind === "tool_call" && message.toolCallId) {
    const toolCall = toolCallsById.get(message.toolCallId);
    if (toolCall) {
      return formatToolCallRecord(toolCall);
    }
  }
  if (message.kind === "file_call" && message.fileCallId) {
    const fileCall = fileCallsById.get(message.fileCallId);
    if (fileCall) {
      return formatFileCallRecord(fileCall);
    }
  }
  return message.text ?? "";
}

async function buildSessionHistoryContext(cwd: string, sessionId: string): Promise<string> {
  const [messages, toolCalls, fileCalls] = await Promise.all([
    readMessages(cwd, sessionId),
    readToolCalls(cwd, sessionId),
    readFileCalls(cwd, sessionId),
  ]);
  const toolCallsById = new Map(toolCalls.map(record => [record.id, record]));
  const fileCallsById = new Map(fileCalls.map(record => [record.id, record]));
  return messages
    .sort((a, b) => a.sequence - b.sequence)
    .map(message => resolveExpandedMessageText(message, toolCallsById, fileCallsById))
    .filter(text => text.trim().length > 0)
    .join("\n\n");
}

async function loadSystemPrompts(systemPromptFilePaths: string[]): Promise<string> {
  const texts: string[] = [];
  for (const filePath of systemPromptFilePaths) {
    texts.push(await readFile(filePath, "utf-8"));
  }
  return texts.join("\n\n");
}

export async function executeSessionTask(
  cwd: string,
  sessionId: string,
  task: SessionTaskRecord,
  ctx: ExtensionContextLike,
  deps: SessionTaskRunnerDeps = defaultDeps,
): Promise<SessionTaskExecutionResult> {
  const config = await readSessionConfig(cwd, sessionId);
  const layout = createSessionLayout(cwd, sessionId);

  const [systemPrompt, mountedContext, historyContext, temporaryContext] = await Promise.all([
    loadSystemPrompts(config.systemPromptFilePaths),
    deps.composeContextText(config.mounts.flatMap(mount => mount.sources), "\n\n"),
    buildSessionHistoryContext(cwd, sessionId),
    task.temporarySources?.length ? deps.composeContextText(task.temporarySources, "\n\n") : Promise.resolve(""),
  ]);

  for (const filePath of config.systemPromptFilePaths) {
    await appendSessionFileCall(cwd, sessionId, {
      id: `file-${randomUUID()}`,
      taskId: task.id,
      filePath,
      accessType: "system-prompt",
      metadata: { label: basename(filePath) },
    });
  }

  const context = [mountedContext, historyContext, temporaryContext]
    .filter(part => part.trim().length > 0)
    .join("\n\n");

  const result = await deps.runWithSdk({
    inputText: task.inputText,
    context,
    systemPrompt,
    cwd,
    turnIdentity: {
      runId: sessionId,
      keyParts: [task.id],
    },
    modelRegistry: ctx.modelRegistry,
    ...(ctx.model ? { currentModel: ctx.model } : {}),
    ...(config.modelSelection ? { modelSelection: config.modelSelection } : {}),
    ...(config.tools ? { tools: config.tools } : {}),
    sdkMode: config.sdkMode,
    ...(config.sdkOptions ? { sdkOptions: config.sdkOptions } : {}),
    onEvent: async (event) => {
      if (event.type === "tool_call_started" || event.type === "tool_call_finished") {
        await appendSessionEvent(cwd, sessionId, {
          taskId: task.id,
          type: event.type,
          payload: event.payload,
        });
      }
    },
  });

  let nextSequence = await getNextMessageSequence(cwd, sessionId);

  await appendSessionMessage(cwd, sessionId, {
    id: `${task.id}:reasoning`,
    taskId: task.id,
    sequence: nextSequence++,
    kind: "reasoning",
    text: result.reasoningText,
  });

  for (const trace of result.toolCalls) {
    await appendSessionToolCall(cwd, sessionId, {
      id: trace.id,
      taskId: task.id,
      messageId: `${task.id}:tool:${trace.id}`,
      toolName: trace.toolName,
      params: trace.params,
      result: trace.result,
      error: Boolean(trace.metadata?.isError),
      ...(trace.metadata ? { metadata: trace.metadata } : {}),
    });
    await appendSessionMessage(cwd, sessionId, {
      id: `${task.id}:tool:${trace.id}`,
      taskId: task.id,
      sequence: nextSequence++,
      kind: "tool_call",
      toolCallId: trace.id,
    });

    const filePath = inferFilePath(trace.params);
    if (filePath && isFileAccessTool(trace.toolName)) {
      const fileCallId = `file-${randomUUID()}`;
      await appendSessionFileCall(cwd, sessionId, {
        id: fileCallId,
        taskId: task.id,
        toolCallId: trace.id,
        filePath,
        accessType: trace.toolName as "read" | "write" | "edit",
      });
      await appendSessionMessage(cwd, sessionId, {
        id: `${task.id}:file:${fileCallId}`,
        taskId: task.id,
        sequence: nextSequence++,
        kind: "file_call",
        fileCallId,
      });
    }
  }

  await appendSessionMessage(cwd, sessionId, {
    id: `${task.id}:reply`,
    taskId: task.id,
    sequence: nextSequence,
    kind: "reply",
    text: result.replyText,
  });

  await appendSessionEvent(cwd, sessionId, {
    taskId: task.id,
    type: "task_artifacts_written",
    payload: {
      messagesPath: layout.messagesPath,
      toolCallsPath: layout.toolCallsPath,
      fileCallsPath: layout.fileCallsPath,
    },
  });

  return {
    taskId: task.id,
    model: result.model,
    tools: result.tools,
    prompt: result.prompt,
  };
}
