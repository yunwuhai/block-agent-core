import { fromNumberRanges } from "../utils/range-utils.ts";
import type { SessionMessageRecord } from "./types.ts";

export function buildChildrenMap(messages: SessionMessageRecord[]): Map<number, number[]> {
  const map = new Map<number, number[]>();
  for (const message of messages) {
    const parentId = message.parentId;
    if (typeof parentId !== "number" || !Number.isInteger(parentId)) {
      continue;
    }
    const children = map.get(parentId) ?? [];
    children.push(message.id);
    map.set(parentId, children);
  }
  return map;
}

export function collectDescendantIds(
  startingIds: number[],
  activeIds: Set<number>,
  childrenByParent: Map<number, number[]>,
): number[] {
  const seen = new Set<number>();
  const queue = [...startingIds];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current) || !activeIds.has(current)) {
      continue;
    }
    seen.add(current);
    for (const child of childrenByParent.get(current) ?? []) {
      if (activeIds.has(child) && !seen.has(child)) {
        queue.push(child);
      }
    }
  }
  return [...seen].sort((a, b) => a - b);
}

export function removeIdsAndDescendants(
  activeIds: Set<number>,
  idRanges: number[][],
  childrenByParent: Map<number, number[]>,
): number[] {
  const seedIds = fromNumberRanges(idRanges)
    .filter(id => activeIds.has(id));
  const removedIds = collectDescendantIds(seedIds, activeIds, childrenByParent);
  for (const id of removedIds) {
    activeIds.delete(id);
  }
  return removedIds;
}
