// session/context-state.ts
// Session 上下文状态管理——挂载/卸载、上下文快照、活跃消息追踪
// 从 session-store.ts 拆分

import { toNumberRanges, fromNumberRanges, normalizeRanges } from "../utils/range-utils.ts";
import { buildChildrenMap, removeIdsAndDescendants } from "./message-tree.ts";
import {
  appendSessionEvent,
  readEvents,
  readMessages,
  readSessionConfig,
} from "./store.ts";
import type { ContextMount } from "./types.ts";
import type { ContextSource } from "./context-sources.ts";

// ===========================================================================
// ContextMount 解析
// ===========================================================================

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
  const idRanges = normalizeRanges(candidate.idRanges);
  const metadata = candidate.metadata && typeof candidate.metadata === "object"
    ? candidate.metadata as Record<string, unknown>
    : undefined;
  return {
    id,
    ...(sources?.length ? { sources } : {}),
    ...(idRanges.length ? { idRanges } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

// ===========================================================================
// 上下文挂载/卸载
// ===========================================================================

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
  input: { sources?: ContextSource[]; idRanges?: number[][]; metadata?: Record<string, unknown> },
): Promise<ContextMount> {
  await readSessionConfig(cwd, sessionId);
  const currentMounts = await listContextMounts(cwd, sessionId);
  const idRanges = normalizeRanges(input.idRanges);
  const sources = input.sources?.length ? input.sources : undefined;
  if (!sources?.length && idRanges.length === 0) {
    throw new Error("A context mount requires either sources or idRanges");
  }
  const mount: ContextMount = {
    id: currentMounts.reduce((max, item) => Math.max(max, item.id), 0) + 1,
    ...(sources ? { sources } : {}),
    ...(idRanges.length ? { idRanges } : {}),
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
  input: { idRanges?: number[][]; mountIds?: Array<string | number> },
): Promise<{ removedMountIds: number[]; removedMessageIds: number[] }> {
  await readSessionConfig(cwd, sessionId);
  const activeMounts = await listContextMounts(cwd, sessionId);
  const messages = await readMessages(cwd, sessionId);
  const currentState = await readCurrentContextState(cwd, sessionId);
  const childrenByParent = buildChildrenMap(messages);
  const activeIdSet = new Set(currentState.activeMessageIds);

  const requestedIds = (input.mountIds ?? [])
    .map(value => Number(value))
    .filter(value => Number.isInteger(value));
  const activeMountMap = new Map(activeMounts.map(mount => [mount.id, mount]));
  const removedIds = requestedIds.filter(id => activeMountMap.has(id));

  const idRanges = normalizeRanges(input.idRanges);
  const removedIdSet = new Set<number>();

  if (idRanges.length > 0) {
    for (const id of removeIdsAndDescendants(activeIdSet, idRanges, childrenByParent)) {
      removedIdSet.add(id);
    }
  }

  for (const mountId of removedIds) {
    const mount = activeMountMap.get(mountId);
    if (!mount?.idRanges?.length) {
      continue;
    }
    for (const id of removeIdsAndDescendants(activeIdSet, mount.idRanges, childrenByParent)) {
      removedIdSet.add(id);
    }
  }

  if (removedIds.length > 0 || removedIdSet.size > 0) {
    await appendSessionEvent(cwd, sessionId, {
      type: "manual_unmount",
      payload: {
        ...(removedIds.length > 0 ? { removedMountIds: removedIds } : {}),
        ...(removedIdSet.size > 0 ? { idRanges: toNumberRanges([...removedIdSet]) } : {}),
      },
    });
  }

  return {
    removedMountIds: removedIds,
    removedMessageIds: [...removedIdSet].sort((a, b) => a - b),
  };
}

// ===========================================================================
// 上下文快照
// ===========================================================================

export async function readLatestSendSnapshot(
  cwd: string,
  sessionId: string,
): Promise<{ activeMessageIds: number[]; lastInputId?: number; lastParentId?: number; lastTurnId?: number }> {
  const events = await readEvents(cwd, sessionId);
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.type !== "send_finished") {
      continue;
    }
    return {
      activeMessageIds: fromNumberRanges(event.payload.activeMessageIdRanges),
      ...(Number.isInteger(Number(event.payload.inputId)) ? { lastInputId: Number(event.payload.inputId) } : {}),
      ...(Number.isInteger(Number(event.payload.parentId)) ? { lastParentId: Number(event.payload.parentId) } : {}),
      ...(typeof event.turnId === "number" ? { lastTurnId: event.turnId } : {}),
    };
  }
  return { activeMessageIds: [] };
}

// ===========================================================================
// 当前上下文状态（增量推导）
// ===========================================================================

export async function readCurrentContextState(
  cwd: string,
  sessionId: string,
): Promise<{ activeMessageIds: number[]; activeMounts: ContextMount[]; lastInputId?: number; lastParentId?: number }> {
  const [messages, events, activeMounts] = await Promise.all([
    readMessages(cwd, sessionId),
    readEvents(cwd, sessionId),
    listContextMounts(cwd, sessionId),
  ]);
  const messagesById = new Map(messages.map(message => [message.id, message]));
  const childrenByParent = buildChildrenMap(messages);

  let activeIdSet = new Set<number>();
  let lastInputId: number | undefined;
  let lastParentId: number | undefined;
  let lastSendIndex = -1;

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.type !== "send_finished") {
      continue;
    }
    activeIdSet = new Set(
      fromNumberRanges(event.payload.activeMessageIdRanges),
    );
    if (Number.isInteger(Number(event.payload.inputId))) {
      lastInputId = Number(event.payload.inputId);
    }
    if (Number.isInteger(Number(event.payload.parentId))) {
      lastParentId = Number(event.payload.parentId);
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
      if (mount.idRanges?.length) {
        for (const id of fromNumberRanges(mount.idRanges)) {
          if (messagesById.has(id)) {
            activeIdSet.add(id);
          }
        }
        postSendSeqMounts.set(mount.id, mount);
      }
      continue;
    }

    if (event.type === "manual_unmount") {
      const eventRanges = normalizeRanges(event.payload.idRanges);
      if (eventRanges.length > 0) {
        removeIdsAndDescendants(activeIdSet, eventRanges, childrenByParent);
      }
      if (Array.isArray(event.payload.removedMountIds)) {
        for (const rawId of event.payload.removedMountIds) {
          const mountId = Number(rawId);
          if (!Number.isInteger(mountId)) {
            continue;
          }
          const mounted = postSendSeqMounts.get(mountId);
          if (mounted?.idRanges?.length) {
            removeIdsAndDescendants(activeIdSet, mounted.idRanges, childrenByParent);
          }
          postSendSeqMounts.delete(mountId);
        }
      }
    }
  }

  return {
    activeMessageIds: [...activeIdSet].sort((a, b) => a - b),
    activeMounts,
    ...(lastInputId !== undefined ? { lastInputId } : {}),
    ...(lastParentId !== undefined ? { lastParentId } : {}),
  };
}

export async function getCurrentParentSequence(cwd: string, sessionId: string): Promise<number | undefined> {
  const state = await readCurrentContextState(cwd, sessionId);
  if (state.activeMessageIds.length === 0) {
    return undefined;
  }
  return state.activeMessageIds[state.activeMessageIds.length - 1];
}
