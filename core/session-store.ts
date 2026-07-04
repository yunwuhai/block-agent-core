import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import type { ContextSource } from "./context-sources.ts";
import type { PiModelSummary } from "../adapter/pi-sdk.ts";
import type { SubagentModelSelection, SubagentToolSelection } from "./subagent-run.ts";
import { appendJsonl, readJsonl, writeJsonl } from "../utils/jsonl.ts";

const fileLocks = new Map<string, Promise<void>>();

export type SessionSdkMode = "host-inherit" | "standalone-sdk";
export type SessionMessageKind = "reasoning" | "reply" | "note" | "tool_call" | "file_call";
export type SessionTaskStatus = "queued" | "running" | "completed" | "failed";
export type FileAccessType = "read" | "write" | "edit" | "reference" | "system-prompt";

export interface StandaloneSdkOptions {
  sdkModulePath?: string;
  authStoragePath?: string;
  currentModel?: {
    provider: string;
    modelId: string;
    displayName?: string;
    reasoning?: boolean;
    input?: string[];
  };
}

export interface ContextMount {
  id: string;
  createdAt: string;
  sources: ContextSource[];
  metadata?: Record<string, unknown>;
}

export interface SessionSystemPromptsConfig {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  systemPromptFilePaths: string[];
  sdkMode: SessionSdkMode;
  modelSelection?: SubagentModelSelection;
  tools?: SubagentToolSelection;
  sdkOptions?: StandaloneSdkOptions;
  mounts: ContextMount[];
}

export interface SessionMessageRecord {
  id: string;
  sessionId: string;
  taskId?: string;
  sequence: number;
  kind: SessionMessageKind;
  text?: string;
  toolCallId?: string;
  fileCallId?: string;
  tags?: string[];
  handoff?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface SessionToolCallRecord {
  id: string;
  sessionId: string;
  taskId: string;
  messageId?: string;
  toolName: string;
  params: unknown;
  result: unknown;
  createdAt: string;
  error?: boolean;
  metadata?: Record<string, unknown>;
}

export interface SessionFileCallRecord {
  id: string;
  sessionId: string;
  taskId?: string;
  messageId?: string;
  toolCallId?: string;
  filePath: string;
  accessType: FileAccessType;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface SessionTaskRecord {
  id: string;
  sessionId: string;
  inputText: string;
  temporarySources?: ContextSource[];
  status: SessionTaskStatus;
  queuePosition?: number;
  registeredAt: string;
  startedAt?: string;
  finishedAt?: string;
  model?: PiModelSummary;
  tools?: string[];
  archiveEnabled?: boolean;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface SessionEventRecord {
  id: string;
  taskId: string;
  sessionId: string;
  type: string;
  createdAt: string;
  payload: Record<string, unknown>;
}

export interface SessionLayout {
  rootDir: string;
  messagesPath: string;
  toolCallsPath: string;
  fileCallsPath: string;
  systemPromptsPath: string;
  tasksPath: string;
  eventsPath: string;
}

export interface CreateSessionInput {
  sessionId: string;
  systemPromptFilePaths: string[];
  sdkMode: SessionSdkMode;
  modelSelection?: SubagentModelSelection;
  tools?: SubagentToolSelection;
  sdkOptions?: StandaloneSdkOptions;
}

export interface CreateTaskInput {
  taskId: string;
  inputText: string;
  temporarySources?: ContextSource[];
  archiveEnabled?: boolean;
  metadata?: Record<string, unknown>;
}

export function createSessionsRootDir(cwd: string): string {
  return join(cwd, ".block-agent-core", "sessions");
}

export function createSessionLayout(cwd: string, sessionId: string): SessionLayout {
  const rootDir = join(createSessionsRootDir(cwd), sessionId);
  return {
    rootDir,
    messagesPath: join(rootDir, "messages.jsonl"),
    toolCallsPath: join(rootDir, "tool-calls.jsonl"),
    fileCallsPath: join(rootDir, "file-calls.jsonl"),
    systemPromptsPath: join(rootDir, "system-prompts.json"),
    tasksPath: join(rootDir, "tasks.jsonl"),
    eventsPath: join(rootDir, "events.jsonl"),
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

async function withFileLock<T>(filePath: string, task: () => Promise<T>): Promise<T> {
  const previous = fileLocks.get(filePath) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => {
    release = resolve;
  });
  fileLocks.set(filePath, previous.then(() => current));
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (fileLocks.get(filePath) === current) {
      fileLocks.delete(filePath);
    }
  }
}

async function ensureParentFile(filePath: string, fallbackContent: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  if (!existsSync(filePath)) {
    await writeFile(filePath, fallbackContent, "utf-8");
  }
}

export async function createSession(
  cwd: string,
  input: CreateSessionInput,
): Promise<{ layout: SessionLayout; config: SessionSystemPromptsConfig }> {
  const layout = createSessionLayout(cwd, input.sessionId);
  if (existsSync(layout.systemPromptsPath)) {
    throw new Error(`Session already exists: ${input.sessionId}`);
  }

  const createdAt = nowIso();
  const config: SessionSystemPromptsConfig = {
    sessionId: input.sessionId,
    createdAt,
    updatedAt: createdAt,
    systemPromptFilePaths: [...input.systemPromptFilePaths],
    sdkMode: input.sdkMode,
    ...(input.modelSelection ? { modelSelection: input.modelSelection } : {}),
    ...(input.tools ? { tools: input.tools } : {}),
    ...(input.sdkOptions ? { sdkOptions: input.sdkOptions } : {}),
    mounts: [],
  };

  await mkdir(layout.rootDir, { recursive: true });
  await writeFile(layout.systemPromptsPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
  await ensureParentFile(layout.messagesPath, "");
  await ensureParentFile(layout.toolCallsPath, "");
  await ensureParentFile(layout.fileCallsPath, "");
  await ensureParentFile(layout.tasksPath, "");
  await ensureParentFile(layout.eventsPath, "");

  return { layout, config };
}

export async function readSessionConfig(cwd: string, sessionId: string): Promise<SessionSystemPromptsConfig> {
  const layout = createSessionLayout(cwd, sessionId);
  if (!existsSync(layout.systemPromptsPath)) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  const raw = await readFile(layout.systemPromptsPath, "utf-8");
  return JSON.parse(raw) as SessionSystemPromptsConfig;
}

export async function writeSessionConfig(cwd: string, config: SessionSystemPromptsConfig): Promise<void> {
  const layout = createSessionLayout(cwd, config.sessionId);
  const nextConfig = {
    ...config,
    updatedAt: nowIso(),
  };
  await mkdir(layout.rootDir, { recursive: true });
  await writeFile(layout.systemPromptsPath, JSON.stringify(nextConfig, null, 2) + "\n", "utf-8");
}

export async function updateSessionConfig(
  cwd: string,
  sessionId: string,
  patch: {
    systemPromptFilePaths?: string[];
    sdkMode?: SessionSdkMode;
    modelSelection?: SubagentModelSelection;
    tools?: SubagentToolSelection;
    sdkOptions?: StandaloneSdkOptions;
  },
): Promise<SessionSystemPromptsConfig> {
  const current = await readSessionConfig(cwd, sessionId);
  const nextConfig: SessionSystemPromptsConfig = {
    ...current,
    ...(patch.systemPromptFilePaths ? { systemPromptFilePaths: [...patch.systemPromptFilePaths] } : {}),
    ...(patch.sdkMode ? { sdkMode: patch.sdkMode } : {}),
    ...(patch.modelSelection ? { modelSelection: patch.modelSelection } : {}),
    ...(patch.tools ? { tools: patch.tools } : {}),
    ...(patch.sdkOptions ? { sdkOptions: patch.sdkOptions } : {}),
  };
  await writeSessionConfig(cwd, nextConfig);
  return readSessionConfig(cwd, sessionId);
}

export async function listSessions(cwd: string): Promise<SessionSystemPromptsConfig[]> {
  const rootDir = createSessionsRootDir(cwd);
  if (!existsSync(rootDir)) {
    return [];
  }
  const entries = await readdir(rootDir, { withFileTypes: true });
  const sessions: SessionSystemPromptsConfig[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      sessions.push(await readSessionConfig(cwd, entry.name));
    } catch {
      // Ignore malformed session directories.
    }
  }
  return sessions.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function mountContext(
  cwd: string,
  sessionId: string,
  sources: ContextSource[],
  metadata?: Record<string, unknown>,
): Promise<ContextMount> {
  const config = await readSessionConfig(cwd, sessionId);
  const mount: ContextMount = {
    id: `mount-${randomUUID()}`,
    createdAt: nowIso(),
    sources,
    ...(metadata ? { metadata } : {}),
  };
  config.mounts.push(mount);
  await writeSessionConfig(cwd, config);
  return mount;
}

export async function unmountContext(
  cwd: string,
  sessionId: string,
  mountIds: string[],
): Promise<{ removedIds: string[] }> {
  const config = await readSessionConfig(cwd, sessionId);
  const before = config.mounts.length;
  config.mounts = config.mounts.filter(mount => !mountIds.includes(mount.id));
  await writeSessionConfig(cwd, config);
  const removedIds = before === config.mounts.length
    ? []
    : mountIds.filter(id => !config.mounts.find(mount => mount.id === id));
  return { removedIds };
}

export async function listContextMounts(cwd: string, sessionId: string): Promise<ContextMount[]> {
  const config = await readSessionConfig(cwd, sessionId);
  return [...config.mounts];
}

export async function readMessages(cwd: string, sessionId: string): Promise<SessionMessageRecord[]> {
  return readJsonl<SessionMessageRecord>(createSessionLayout(cwd, sessionId).messagesPath);
}

export async function readToolCalls(cwd: string, sessionId: string): Promise<SessionToolCallRecord[]> {
  return readJsonl<SessionToolCallRecord>(createSessionLayout(cwd, sessionId).toolCallsPath);
}

export async function readFileCalls(cwd: string, sessionId: string): Promise<SessionFileCallRecord[]> {
  return readJsonl<SessionFileCallRecord>(createSessionLayout(cwd, sessionId).fileCallsPath);
}

export async function readTasks(cwd: string, sessionId: string): Promise<SessionTaskRecord[]> {
  return readJsonl<SessionTaskRecord>(createSessionLayout(cwd, sessionId).tasksPath);
}

export async function readEvents(cwd: string, sessionId: string): Promise<SessionEventRecord[]> {
  return readJsonl<SessionEventRecord>(createSessionLayout(cwd, sessionId).eventsPath);
}

export async function getNextMessageSequence(cwd: string, sessionId: string): Promise<number> {
  const messages = await readMessages(cwd, sessionId);
  const maxSequence = messages.reduce((max, message) => Math.max(max, message.sequence), 0);
  return maxSequence + 1;
}

export async function appendSessionMessage(
  cwd: string,
  sessionId: string,
  record: Omit<SessionMessageRecord, "sessionId" | "createdAt">,
): Promise<SessionMessageRecord> {
  const fullRecord: SessionMessageRecord = {
    ...record,
    sessionId,
    createdAt: nowIso(),
  };
  await appendJsonl(createSessionLayout(cwd, sessionId).messagesPath, fullRecord);
  return fullRecord;
}

export async function appendSessionToolCall(
  cwd: string,
  sessionId: string,
  record: Omit<SessionToolCallRecord, "sessionId" | "createdAt">,
): Promise<SessionToolCallRecord> {
  const fullRecord: SessionToolCallRecord = {
    ...record,
    sessionId,
    createdAt: nowIso(),
  };
  await appendJsonl(createSessionLayout(cwd, sessionId).toolCallsPath, fullRecord);
  return fullRecord;
}

export async function appendSessionFileCall(
  cwd: string,
  sessionId: string,
  record: Omit<SessionFileCallRecord, "sessionId" | "createdAt">,
): Promise<SessionFileCallRecord> {
  const fullRecord: SessionFileCallRecord = {
    ...record,
    sessionId,
    createdAt: nowIso(),
  };
  await appendJsonl(createSessionLayout(cwd, sessionId).fileCallsPath, fullRecord);
  return fullRecord;
}

export async function appendSessionEvent(
  cwd: string,
  sessionId: string,
  record: Omit<SessionEventRecord, "createdAt" | "id" | "sessionId">,
): Promise<SessionEventRecord> {
  const fullRecord: SessionEventRecord = {
    ...record,
    id: `event-${randomUUID()}`,
    sessionId,
    createdAt: nowIso(),
  };
  await appendJsonl(createSessionLayout(cwd, sessionId).eventsPath, fullRecord);
  return fullRecord;
}

export async function createSessionTask(
  cwd: string,
  sessionId: string,
  input: CreateTaskInput,
): Promise<SessionTaskRecord> {
  await readSessionConfig(cwd, sessionId);
  const layout = createSessionLayout(cwd, sessionId);
  return withFileLock(layout.tasksPath, async () => {
    const tasks = await readJsonl<SessionTaskRecord>(layout.tasksPath);
    const task: SessionTaskRecord = {
      id: input.taskId,
      sessionId,
      inputText: input.inputText,
      ...(input.temporarySources ? { temporarySources: input.temporarySources } : {}),
      status: "queued",
      registeredAt: nowIso(),
      ...(input.archiveEnabled !== undefined ? { archiveEnabled: input.archiveEnabled } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };
    tasks.push(task);
    await writeJsonl(layout.tasksPath, tasks);
    return task;
  });
}

export async function updateSessionTask(
  cwd: string,
  sessionId: string,
  taskId: string,
  updater: (task: SessionTaskRecord) => SessionTaskRecord,
): Promise<SessionTaskRecord> {
  const layout = createSessionLayout(cwd, sessionId);
  return withFileLock(layout.tasksPath, async () => {
    const tasks = await readJsonl<SessionTaskRecord>(layout.tasksPath);
    const index = tasks.findIndex(task => task.id === taskId);
    if (index === -1) {
      throw new Error(`Task not found: ${taskId}`);
    }
    tasks[index] = updater(tasks[index]!);
    await writeJsonl(layout.tasksPath, tasks);
    return tasks[index]!;
  });
}

export async function getSessionTask(
  cwd: string,
  sessionId: string,
  taskId: string,
): Promise<SessionTaskRecord | undefined> {
  const tasks = await readTasks(cwd, sessionId);
  return tasks.find(task => task.id === taskId);
}
