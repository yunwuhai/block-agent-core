// session/store.ts
// Session 数据持久层——JSONL 文件读写、配置管理
// 从 session-store.ts 拆分，保留了完整 CRUD 能力

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { appendJsonl, readJsonl } from "../utils/jsonl.ts";
import { nowIso } from "../utils/datetime.ts";
import type {
  CreateSessionInput,
  SessionEventRecord,
  SessionLayout,
  SessionMessageRecord,
  SessionSdkMode,
  SessionSystemConfig,
  StandaloneSdkOptions,
} from "./types.ts";
import type { SubagentModelSelection, SubagentToolSelection } from "./subagent-run.ts";

// ===========================================================================
// 文件锁——防止并发写入同一个 JSONL 时产生竞态
// ===========================================================================

const fileLocks = new Map<string, Promise<void>>();

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

// ===========================================================================
// 内部辅助函数
// ===========================================================================

async function ensureParentFile(filePath: string, fallbackContent: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  if (!existsSync(filePath)) {
    await writeFile(filePath, fallbackContent, "utf-8");
  }
}

async function rewriteJsonlRecords<T>(
  filePath: string,
  records: T[],
): Promise<void> {
  await ensureParentFile(filePath, "");
  const nextContent = records.length > 0
    ? `${records.map(record => JSON.stringify(record)).join("\n")}\n`
    : "";
  await writeFile(filePath, nextContent, "utf-8");
}

async function getNextId(filePath: string, key: string = "id"): Promise<number> {
  const records = await readJsonl<Record<string, unknown>>(filePath);
  const maxSeq = records.reduce((max, record) => {
    const value = Number(record[key] ?? 0);
    return Number.isInteger(value) ? Math.max(max, value) : max;
  }, 0);
  return maxSeq + 1;
}

// ===========================================================================
// Session 路径和布局
// ===========================================================================

export function createSessionsRootDir(cwd: string): string {
  return join(cwd, ".block-agent-core", "sessions");
}

export function createSessionLayout(cwd: string, sessionId: string): SessionLayout {
  const rootDir = join(createSessionsRootDir(cwd), sessionId);
  return {
    rootDir,
    messagesPath: join(rootDir, "messages.jsonl"),
    systemConfigPath: join(rootDir, "system-config.json"),
    eventsPath: join(rootDir, "events.jsonl"),
  };
}

// ===========================================================================
// Session CRUD
// ===========================================================================

export async function createSession(
  cwd: string,
  input: CreateSessionInput,
): Promise<{ layout: SessionLayout; config: SessionSystemConfig }> {
  const layout = createSessionLayout(cwd, input.sessionId);
  if (existsSync(layout.systemConfigPath) || existsSync(join(layout.rootDir, "system-prompts.json"))) {
    throw new Error(`Session already exists: ${input.sessionId}`);
  }

  const createdAt = nowIso();

  // Read and concatenate system prompt files
  const systemPromptTexts: string[] = [];
  for (const filePath of input.systemPromptFilePaths) {
    const text = await readFile(filePath, "utf-8");
    systemPromptTexts.push(text);
  }
  const systemPromptText = systemPromptTexts.join("\n\n");

  const config: SessionSystemConfig = {
    sessionId: input.sessionId,
    createdAt,
    updatedAt: createdAt,
    systemPromptFilePaths: [...input.systemPromptFilePaths],
    systemPromptText,
    sdkMode: input.sdkMode,
    nextTurnId: 1,
    ...(input.modelSelection ? { modelSelection: input.modelSelection } : {}),
    ...(input.tools ? { tools: input.tools } : {}),
    ...(input.sdkOptions ? { sdkOptions: input.sdkOptions } : {}),
  };

  await mkdir(layout.rootDir, { recursive: true });
  await writeFile(layout.systemConfigPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
  await ensureParentFile(layout.messagesPath, "");
  await ensureParentFile(layout.eventsPath, "");

  await appendSessionEvent(cwd, input.sessionId, {
    type: "session_initialized",
    payload: {
      systemPromptFilePaths: config.systemPromptFilePaths,
      sdkMode: config.sdkMode,
      ...(config.modelSelection ? { modelSelection: config.modelSelection } : {}),
      ...(config.tools ? { tools: config.tools } : {}),
      ...(config.sdkOptions ? { sdkOptions: config.sdkOptions } : {}),
    },
  });

  return { layout, config };
}

export async function readSessionConfig(cwd: string, sessionId: string): Promise<SessionSystemConfig> {
  const layout = createSessionLayout(cwd, sessionId);
  if (existsSync(layout.systemConfigPath)) {
    const raw = await readFile(layout.systemConfigPath, "utf-8");
    return JSON.parse(raw) as SessionSystemConfig;
  }
  // Legacy: try system-prompts.json format
  const legacyPath = join(layout.rootDir, "system-prompts.json");
  if (!existsSync(legacyPath)) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  const raw = await readFile(legacyPath, "utf-8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  return {
    sessionId: String(parsed.sessionId ?? ""),
    createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : nowIso(),
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : nowIso(),
    systemPromptFilePaths: Array.isArray(parsed.systemPromptFilePaths)
      ? parsed.systemPromptFilePaths.filter((item): item is string => typeof item === "string")
      : [],
    systemPromptText: typeof parsed.systemPromptText === "string" ? parsed.systemPromptText : "",
    sdkMode: parsed.sdkMode === "standalone-sdk" ? "standalone-sdk" : (() => {
      if (parsed.sdkMode !== undefined && parsed.sdkMode !== "host-inherit") {
        console.warn(`[block-agent-core] Unknown sdkMode "${String(parsed.sdkMode)}" in legacy config, falling back to "host-inherit"`);
      }
      return "host-inherit" as const;
    })(),
    nextTurnId: typeof parsed.nextTurnId === "number" ? parsed.nextTurnId : 1,
    ...(parsed.modelSelection ? { modelSelection: parsed.modelSelection as SubagentModelSelection } : {}),
    ...(parsed.tools ? { tools: parsed.tools as SubagentToolSelection } : {}),
    ...(parsed.sdkOptions ? { sdkOptions: parsed.sdkOptions as StandaloneSdkOptions } : {}),
  };
}

export async function allocateTurnId(cwd: string, sessionId: string): Promise<number> {
  const config = await readSessionConfig(cwd, sessionId);
  const turnId = config.nextTurnId;
  config.nextTurnId = turnId + 1;
  await writeSessionConfig(cwd, config);
  return turnId;
}

export async function writeSessionConfig(cwd: string, config: SessionSystemConfig): Promise<SessionSystemConfig> {
  const layout = createSessionLayout(cwd, config.sessionId);
  const nextConfig: SessionSystemConfig = {
    ...config,
    updatedAt: nowIso(),
  };
  await mkdir(layout.rootDir, { recursive: true });
  await writeFile(layout.systemConfigPath, JSON.stringify(nextConfig, null, 2) + "\n", "utf-8");
  return nextConfig;
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
): Promise<SessionSystemConfig> {
  const current = await readSessionConfig(cwd, sessionId);
  const nextConfig: SessionSystemConfig = {
    ...current,
    ...(patch.systemPromptFilePaths ? { systemPromptFilePaths: [...patch.systemPromptFilePaths] } : {}),
    ...(patch.sdkMode ? { sdkMode: patch.sdkMode } : {}),
    ...(patch.modelSelection ? { modelSelection: patch.modelSelection } : {}),
    ...(patch.tools ? { tools: patch.tools } : {}),
    ...(patch.sdkOptions ? { sdkOptions: patch.sdkOptions } : {}),
  };
  const written = await writeSessionConfig(cwd, nextConfig);
  await appendSessionEvent(cwd, sessionId, {
    type: "session_config_updated",
    payload: {
      ...(patch.systemPromptFilePaths ? { systemPromptFilePaths: patch.systemPromptFilePaths } : {}),
      ...(patch.sdkMode ? { sdkMode: patch.sdkMode } : {}),
      ...(patch.modelSelection ? { modelSelection: patch.modelSelection } : {}),
      ...(patch.tools ? { tools: patch.tools } : {}),
      ...(patch.sdkOptions ? { sdkOptions: patch.sdkOptions } : {}),
    },
  });
  return written;
}

export async function listSessions(cwd: string): Promise<SessionSystemConfig[]> {
  const rootDir = createSessionsRootDir(cwd);
  if (!existsSync(rootDir)) {
    return [];
  }
  const entries = await readdir(rootDir, { withFileTypes: true });
  const sessions: SessionSystemConfig[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const config = await readSessionConfig(cwd, entry.name);
      sessions.push(config);
    } catch {
      // Ignore malformed session directories.
    }
  }
  return sessions.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// ===========================================================================
// 消息/事件读写
// ===========================================================================

export async function readMessages(cwd: string, sessionId: string): Promise<SessionMessageRecord[]> {
  return readJsonl<SessionMessageRecord>(createSessionLayout(cwd, sessionId).messagesPath);
}

export async function readEvents(cwd: string, sessionId: string): Promise<SessionEventRecord[]> {
  return readJsonl<SessionEventRecord>(createSessionLayout(cwd, sessionId).eventsPath);
}

export async function appendSessionMessage(
  cwd: string,
  sessionId: string,
  record: Omit<SessionMessageRecord, "id"> & { id?: number },
): Promise<SessionMessageRecord> {
  const layout = createSessionLayout(cwd, sessionId);
  return withFileLock(layout.messagesPath, async () => {
    const { turnId, parentId, id: callerId, ...rest } = record;
    const fullRecord: SessionMessageRecord = {
      ...(turnId !== undefined ? { turnId } : {}),
      id: callerId ?? await getNextId(layout.messagesPath),
      ...(parentId !== undefined ? { parentId } : {}),
      ...rest,
    };
    await appendJsonl(layout.messagesPath, fullRecord);
    return fullRecord;
  });
}

export async function appendSessionEvent(
  cwd: string,
  sessionId: string,
  record: Omit<SessionEventRecord, "id" | "createdAt"> & { id?: number },
): Promise<SessionEventRecord> {
  const layout = createSessionLayout(cwd, sessionId);
  return withFileLock(layout.eventsPath, async () => {
    const { turnId, id: callerId, ...rest } = record;
    const fullRecord: SessionEventRecord = {
      ...(turnId !== undefined ? { turnId } : {}),
      id: callerId ?? await getNextId(layout.eventsPath),
      ...rest,
      createdAt: nowIso(),
    };
    await appendJsonl(layout.eventsPath, fullRecord);
    return fullRecord;
  });
}

export async function removeSessionMessagesById(
  cwd: string,
  sessionId: string,
  seqs: number[],
): Promise<void> {
  if (seqs.length === 0) {
    return;
  }
  const layout = createSessionLayout(cwd, sessionId);
  const seqSet = new Set(seqs);
  await withFileLock(layout.messagesPath, async () => {
    const records = await readJsonl<SessionMessageRecord>(layout.messagesPath);
    await rewriteJsonlRecords(layout.messagesPath, records.filter(record => !seqSet.has(record.id)));
  });
}
