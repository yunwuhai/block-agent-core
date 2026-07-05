import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ContextSource } from "./context-sources.ts";
import { appendJsonl, readJsonl } from "../utils/jsonl.ts";
import type { SubagentModelSelection, SubagentToolSelection } from "./subagent-run.ts";

const fileLocks = new Map<string, Promise<void>>();

export type SessionSdkMode = "host-inherit" | "standalone-sdk";
export type SessionMessageKind = "system_prompt" | "input" | "reasoning" | "reply" | "tool_call" | "file_call";

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
  id: number;
  sources?: ContextSource[];
  seqRanges?: number[][];
  metadata?: Record<string, unknown>;
}

export interface SessionSystemConfig {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  systemPromptFilePaths: string[];
  sdkMode: SessionSdkMode;
  modelSelection?: SubagentModelSelection;
  tools?: SubagentToolSelection;
  sdkOptions?: StandaloneSdkOptions;
}

export interface SessionMessageRecord {
  seq: number;
  kind: SessionMessageKind;
  text?: string;
  parentSeq?: number;
  toolCallSeq?: number;
  fileCallSeq?: number;
  requestKey?: string;
  tags?: string[];
  handoff?: string;
  metadata?: Record<string, unknown>;
}

export interface SessionToolCallRecord {
  seq: number;
  toolName: string;
  params: unknown;
  result: unknown;
  error?: boolean;
  requestKey?: string;
  metadata?: Record<string, unknown>;
}

export interface SessionFileCallRecord {
  seq: number;
  filePath: string;
  requestKey?: string;
  metadata?: Record<string, unknown>;
}

export interface SessionEventRecord {
  seq: number;
  type: string;
  createdAt: string;
  requestKey?: string;
  payload: Record<string, unknown>;
}

export interface SessionLayout {
  rootDir: string;
  messagesPath: string;
  toolCallsPath: string;
  fileCallsPath: string;
  systemConfigPath: string;
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

function toNumberRanges(numbers: number[]): number[][] {
  if (numbers.length === 0) {
    return [];
  }
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  const ranges: number[][] = [];
  let start = sorted[0]!;
  let previous = start;
  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index]!;
    if (current === previous + 1) {
      previous = current;
      continue;
    }
    ranges.push([start, previous]);
    start = current;
    previous = current;
  }
  ranges.push([start, previous]);
  return ranges;
}

function fromNumberRanges(ranges: unknown): number[] {
  if (!Array.isArray(ranges)) {
    return [];
  }
  const values: number[] = [];
  for (const item of ranges) {
    if (!Array.isArray(item) || item.length < 2) {
      continue;
    }
    const start = Number(item[0]);
    const end = Number(item[1]);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) {
      continue;
    }
    for (let current = start; current <= end; current += 1) {
      values.push(current);
    }
  }
  return values;
}

function normalizeRanges(ranges: unknown): number[][] {
  return toNumberRanges(fromNumberRanges(ranges));
}

function isSystemPromptMessage(message: Pick<SessionMessageRecord, "kind"> | undefined): boolean {
  return message?.kind === "system_prompt";
}

function buildChildrenMap(messages: SessionMessageRecord[]): Map<number, number[]> {
  const map = new Map<number, number[]>();
  for (const message of messages) {
    const parentSeq = message.parentSeq;
    if (typeof parentSeq !== "number" || !Number.isInteger(parentSeq)) {
      continue;
    }
    const children = map.get(parentSeq) ?? [];
    children.push(message.seq);
    map.set(parentSeq, children);
  }
  return map;
}

function collectDescendantSeqs(
  startingSeqs: number[],
  activeSeqs: Set<number>,
  childrenByParent: Map<number, number[]>,
): number[] {
  const seen = new Set<number>();
  const queue = [...startingSeqs];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current) || !activeSeqs.has(current)) {
      continue;
    }
    seen.add(current);
    for (const child of childrenByParent.get(current) ?? []) {
      if (activeSeqs.has(child) && !seen.has(child)) {
        queue.push(child);
      }
    }
  }
  return [...seen].sort((a, b) => a - b);
}

function removeSeqsAndDescendants(
  activeSeqs: Set<number>,
  seqRanges: number[][],
  messagesBySeq: Map<number, SessionMessageRecord>,
  childrenByParent: Map<number, number[]>,
): number[] {
  const seedSeqs = fromNumberRanges(seqRanges)
    .filter(seq => activeSeqs.has(seq))
    .filter(seq => !isSystemPromptMessage(messagesBySeq.get(seq)));
  const removedSeqs = collectDescendantSeqs(seedSeqs, activeSeqs, childrenByParent);
  for (const seq of removedSeqs) {
    activeSeqs.delete(seq);
  }
  return removedSeqs;
}

async function readLegacySystemConfig(layout: SessionLayout): Promise<SessionSystemConfig | undefined> {
  const legacyPath = join(layout.rootDir, "system-prompts.json");
  if (!existsSync(legacyPath)) {
    return undefined;
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
    sdkMode: parsed.sdkMode === "standalone-sdk" ? "standalone-sdk" : "host-inherit",
    ...(parsed.modelSelection ? { modelSelection: parsed.modelSelection as SubagentModelSelection } : {}),
    ...(parsed.tools ? { tools: parsed.tools as SubagentToolSelection } : {}),
    ...(parsed.sdkOptions ? { sdkOptions: parsed.sdkOptions as StandaloneSdkOptions } : {}),
  };
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
    systemConfigPath: join(rootDir, "system-config.json"),
    eventsPath: join(rootDir, "events.jsonl"),
  };
}

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

async function getNextSeq(filePath: string, key: string = "seq"): Promise<number> {
  const records = await readJsonl<Record<string, unknown>>(filePath);
  const maxSeq = records.reduce((max, record) => {
    const value = Number(record[key] ?? 0);
    return Number.isInteger(value) ? Math.max(max, value) : max;
  }, 0);
  return maxSeq + 1;
}

function parseContextMount(payload: Record<string, unknown>): ContextMount | undefined {
  const raw = payload.mount;
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const candidate = raw as Record<string, unknown>;
  const id = Number(candidate.id);
  if (!Number.isInteger(id)) {
    return undefined;
  }
  const sources = Array.isArray(candidate.sources)
    ? candidate.sources as ContextSource[]
    : undefined;
  const seqRanges = normalizeRanges(candidate.seqRanges);
  const metadata = candidate.metadata && typeof candidate.metadata === "object"
    ? candidate.metadata as Record<string, unknown>
    : undefined;
  return {
    id,
    ...(sources?.length ? { sources } : {}),
    ...(seqRanges.length ? { seqRanges } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

export async function createSession(
  cwd: string,
  input: CreateSessionInput,
): Promise<{ layout: SessionLayout; config: SessionSystemConfig }> {
  const layout = createSessionLayout(cwd, input.sessionId);
  if (existsSync(layout.systemConfigPath) || existsSync(join(layout.rootDir, "system-prompts.json"))) {
    throw new Error(`Session already exists: ${input.sessionId}`);
  }

  const createdAt = nowIso();
  const config: SessionSystemConfig = {
    sessionId: input.sessionId,
    createdAt,
    updatedAt: createdAt,
    systemPromptFilePaths: [...input.systemPromptFilePaths],
    sdkMode: input.sdkMode,
    ...(input.modelSelection ? { modelSelection: input.modelSelection } : {}),
    ...(input.tools ? { tools: input.tools } : {}),
    ...(input.sdkOptions ? { sdkOptions: input.sdkOptions } : {}),
  };

  await mkdir(layout.rootDir, { recursive: true });
  await writeFile(layout.systemConfigPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
  await ensureParentFile(layout.messagesPath, "");
  await ensureParentFile(layout.toolCallsPath, "");
  await ensureParentFile(layout.fileCallsPath, "");
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
  const legacy = await readLegacySystemConfig(layout);
  if (!legacy) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  return legacy;
}

export async function writeSessionConfig(cwd: string, config: SessionSystemConfig): Promise<void> {
  const layout = createSessionLayout(cwd, config.sessionId);
  const nextConfig: SessionSystemConfig = {
    ...config,
    updatedAt: nowIso(),
  };
  await mkdir(layout.rootDir, { recursive: true });
  await writeFile(layout.systemConfigPath, JSON.stringify(nextConfig, null, 2) + "\n", "utf-8");
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
  await writeSessionConfig(cwd, nextConfig);
  const updated = await readSessionConfig(cwd, sessionId);
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
  return updated;
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
      sessions.push(await readSessionConfig(cwd, entry.name));
    } catch {
      // Ignore malformed session directories.
    }
  }
  return sessions.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
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

export async function readEvents(cwd: string, sessionId: string): Promise<SessionEventRecord[]> {
  return readJsonl<SessionEventRecord>(createSessionLayout(cwd, sessionId).eventsPath);
}

export async function getNextMessageSequence(cwd: string, sessionId: string): Promise<number> {
  return getNextSeq(createSessionLayout(cwd, sessionId).messagesPath);
}

export async function appendSessionMessage(
  cwd: string,
  sessionId: string,
  record: Omit<SessionMessageRecord, "seq"> & { seq?: number },
): Promise<SessionMessageRecord> {
  const layout = createSessionLayout(cwd, sessionId);
  return withFileLock(layout.messagesPath, async () => {
    const fullRecord: SessionMessageRecord = {
      ...record,
      seq: record.seq ?? await getNextSeq(layout.messagesPath),
    };
    await appendJsonl(layout.messagesPath, fullRecord);
    return fullRecord;
  });
}

export async function appendSessionToolCall(
  cwd: string,
  sessionId: string,
  record: Omit<SessionToolCallRecord, "seq"> & { seq?: number },
): Promise<SessionToolCallRecord> {
  const layout = createSessionLayout(cwd, sessionId);
  return withFileLock(layout.toolCallsPath, async () => {
    const fullRecord: SessionToolCallRecord = {
      ...record,
      seq: record.seq ?? await getNextSeq(layout.toolCallsPath),
    };
    await appendJsonl(layout.toolCallsPath, fullRecord);
    return fullRecord;
  });
}

export async function appendSessionFileCall(
  cwd: string,
  sessionId: string,
  record: Omit<SessionFileCallRecord, "seq"> & { seq?: number },
): Promise<SessionFileCallRecord> {
  const layout = createSessionLayout(cwd, sessionId);
  return withFileLock(layout.fileCallsPath, async () => {
    const fullRecord: SessionFileCallRecord = {
      ...record,
      seq: record.seq ?? await getNextSeq(layout.fileCallsPath),
    };
    await appendJsonl(layout.fileCallsPath, fullRecord);
    return fullRecord;
  });
}

export async function appendSessionEvent(
  cwd: string,
  sessionId: string,
  record: Omit<SessionEventRecord, "seq" | "createdAt"> & { seq?: number },
): Promise<SessionEventRecord> {
  const layout = createSessionLayout(cwd, sessionId);
  return withFileLock(layout.eventsPath, async () => {
    const fullRecord: SessionEventRecord = {
      ...record,
      seq: record.seq ?? await getNextSeq(layout.eventsPath),
      createdAt: nowIso(),
    };
    await appendJsonl(layout.eventsPath, fullRecord);
    return fullRecord;
  });
}

export async function removeSessionMessagesBySeq(
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
    await rewriteJsonlRecords(layout.messagesPath, records.filter(record => !seqSet.has(record.seq)));
  });
}

export async function removeSessionFileCallsBySeq(
  cwd: string,
  sessionId: string,
  seqs: number[],
): Promise<void> {
  if (seqs.length === 0) {
    return;
  }
  const layout = createSessionLayout(cwd, sessionId);
  const seqSet = new Set(seqs);
  await withFileLock(layout.fileCallsPath, async () => {
    const records = await readJsonl<SessionFileCallRecord>(layout.fileCallsPath);
    await rewriteJsonlRecords(layout.fileCallsPath, records.filter(record => !seqSet.has(record.seq)));
  });
}

export async function listContextMounts(cwd: string, sessionId: string): Promise<ContextMount[]> {
  const events = await readEvents(cwd, sessionId);
  const mounts = new Map<number, ContextMount>();
  for (const event of events) {
    if (event.type === "manual_mount") {
      const mount = parseContextMount(event.payload);
      if (mount) {
        mounts.set(mount.id, mount);
      }
    }
    if (event.type === "manual_unmount" && Array.isArray(event.payload.removedMountIds)) {
      for (const rawId of event.payload.removedMountIds) {
        const mountId = Number(rawId);
        if (Number.isInteger(mountId)) {
          mounts.delete(mountId);
        }
      }
    }
  }
  return [...mounts.values()].sort((a, b) => a.id - b.id);
}

export async function mountContext(
  cwd: string,
  sessionId: string,
  input: { sources?: ContextSource[]; seqRanges?: number[][]; metadata?: Record<string, unknown> },
): Promise<ContextMount> {
  await readSessionConfig(cwd, sessionId);
  const currentMounts = await listContextMounts(cwd, sessionId);
  const seqRanges = normalizeRanges(input.seqRanges);
  const sources = input.sources?.length ? input.sources : undefined;
  if (!sources?.length && seqRanges.length === 0) {
    throw new Error("A context mount requires either sources or seqRanges");
  }
  const mount: ContextMount = {
    id: currentMounts.reduce((max, item) => Math.max(max, item.id), 0) + 1,
    ...(sources ? { sources } : {}),
    ...(seqRanges.length ? { seqRanges } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
  await appendSessionEvent(cwd, sessionId, {
    type: "manual_mount",
    payload: { mount },
  });
  return mount;
}

export async function unmountContext(
  cwd: string,
  sessionId: string,
  input: { seqRanges?: number[][]; mountIds?: Array<string | number> },
): Promise<{ removedIds: number[]; removedSeqs: number[] }> {
  await readSessionConfig(cwd, sessionId);
  const activeMounts = await listContextMounts(cwd, sessionId);
  const messages = await readMessages(cwd, sessionId);
  const currentState = await readCurrentContextState(cwd, sessionId);
  const messagesBySeq = new Map(messages.map(message => [message.seq, message]));
  const childrenByParent = buildChildrenMap(messages);
  const activeSeqSet = new Set(currentState.activeMessageSeqs);

  const requestedIds = (input.mountIds ?? [])
    .map(value => Number(value))
    .filter(value => Number.isInteger(value));
  const activeMountMap = new Map(activeMounts.map(mount => [mount.id, mount]));
  const removedIds = requestedIds.filter(id => activeMountMap.has(id));

  const seqRanges = normalizeRanges(input.seqRanges);
  const removedSeqSet = new Set<number>();

  if (seqRanges.length > 0) {
    for (const seq of removeSeqsAndDescendants(activeSeqSet, seqRanges, messagesBySeq, childrenByParent)) {
      removedSeqSet.add(seq);
    }
  }

  for (const mountId of removedIds) {
    const mount = activeMountMap.get(mountId);
    if (!mount?.seqRanges?.length) {
      continue;
    }
    for (const seq of removeSeqsAndDescendants(activeSeqSet, mount.seqRanges, messagesBySeq, childrenByParent)) {
      removedSeqSet.add(seq);
    }
  }

  if (removedIds.length > 0 || removedSeqSet.size > 0) {
    await appendSessionEvent(cwd, sessionId, {
      type: "manual_unmount",
      payload: {
        ...(removedIds.length > 0 ? { removedMountIds: removedIds } : {}),
        ...(removedSeqSet.size > 0 ? { seqRanges: toNumberRanges([...removedSeqSet]) } : {}),
      },
    });
  }

  return {
    removedIds,
    removedSeqs: [...removedSeqSet].sort((a, b) => a - b),
  };
}

export async function readLatestSendSnapshot(
  cwd: string,
  sessionId: string,
): Promise<{ activeMessageSeqs: number[]; lastInputSeq?: number; lastParentSeq?: number; lastRequestKey?: string }> {
  const events = await readEvents(cwd, sessionId);
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.type !== "send_finished") {
      continue;
    }
    return {
      activeMessageSeqs: fromNumberRanges(event.payload.activeMessageSeqRanges),
      ...(Number.isInteger(Number(event.payload.inputSeq)) ? { lastInputSeq: Number(event.payload.inputSeq) } : {}),
      ...(Number.isInteger(Number(event.payload.parentSeq)) ? { lastParentSeq: Number(event.payload.parentSeq) } : {}),
      ...(typeof event.requestKey === "string" ? { lastRequestKey: event.requestKey } : {}),
    };
  }
  return { activeMessageSeqs: [] };
}

export async function readCurrentContextState(
  cwd: string,
  sessionId: string,
): Promise<{ activeMessageSeqs: number[]; activeMounts: ContextMount[]; lastInputSeq?: number; lastParentSeq?: number }> {
  const [messages, events, activeMounts] = await Promise.all([
    readMessages(cwd, sessionId),
    readEvents(cwd, sessionId),
    listContextMounts(cwd, sessionId),
  ]);
  const messagesBySeq = new Map(messages.map(message => [message.seq, message]));
  const childrenByParent = buildChildrenMap(messages);

  let activeSeqSet = new Set<number>();
  let lastInputSeq: number | undefined;
  let lastParentSeq: number | undefined;
  let lastSendIndex = -1;

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.type !== "send_finished") {
      continue;
    }
    activeSeqSet = new Set(
      fromNumberRanges(event.payload.activeMessageSeqRanges)
        .filter(seq => !isSystemPromptMessage(messagesBySeq.get(seq))),
    );
    if (Number.isInteger(Number(event.payload.inputSeq))) {
      lastInputSeq = Number(event.payload.inputSeq);
    }
    if (Number.isInteger(Number(event.payload.parentSeq))) {
      lastParentSeq = Number(event.payload.parentSeq);
    }
    lastSendIndex = index;
    break;
  }

  const postSendSeqMounts = new Map<number, ContextMount>();
  for (let index = lastSendIndex + 1; index < events.length; index += 1) {
    const event = events[index]!;
    if (event.type === "manual_mount") {
      const mount = parseContextMount(event.payload);
      if (!mount) {
        continue;
      }
      if (mount.seqRanges?.length) {
        for (const seq of fromNumberRanges(mount.seqRanges)) {
          const message = messagesBySeq.get(seq);
          if (message && !isSystemPromptMessage(message)) {
            activeSeqSet.add(seq);
          }
        }
        postSendSeqMounts.set(mount.id, mount);
      }
      continue;
    }

    if (event.type === "manual_unmount") {
      const eventRanges = normalizeRanges(event.payload.seqRanges);
      if (eventRanges.length > 0) {
        removeSeqsAndDescendants(activeSeqSet, eventRanges, messagesBySeq, childrenByParent);
      }
      if (Array.isArray(event.payload.removedMountIds)) {
        for (const rawId of event.payload.removedMountIds) {
          const mountId = Number(rawId);
          if (!Number.isInteger(mountId)) {
            continue;
          }
          const mounted = postSendSeqMounts.get(mountId);
          if (mounted?.seqRanges?.length) {
            removeSeqsAndDescendants(activeSeqSet, mounted.seqRanges, messagesBySeq, childrenByParent);
          }
          postSendSeqMounts.delete(mountId);
        }
      }
    }
  }

  return {
    activeMessageSeqs: [...activeSeqSet].sort((a, b) => a - b),
    activeMounts,
    ...(lastInputSeq !== undefined ? { lastInputSeq } : {}),
    ...(lastParentSeq !== undefined ? { lastParentSeq } : {}),
  };
}

export async function getCurrentParentSequence(cwd: string, sessionId: string): Promise<number | undefined> {
  const state = await readCurrentContextState(cwd, sessionId);
  if (state.activeMessageSeqs.length === 0) {
    return undefined;
  }
  return state.activeMessageSeqs[state.activeMessageSeqs.length - 1];
}

export function compressMessageSequences(seqs: number[]): number[][] {
  return toNumberRanges(seqs);
}

export function expandMessageSequenceRanges(ranges: unknown): number[] {
  return fromNumberRanges(ranges);
}
