import { describe, expect, it } from "bun:test";
import { buildChildrenMap, collectDescendantIds, removeIdsAndDescendants } from "./message-tree.ts";
import type { SessionMessageRecord } from "./types.ts";

function msg(
  id: number,
  parentId?: number,
  overrides?: Partial<SessionMessageRecord>,
): SessionMessageRecord {
  return {
    id,
    kind: "reply",
    text: `msg-${id}`,
    ...(parentId !== undefined ? { parentId } : {}),
    ...overrides,
  };
}

describe("buildChildrenMap", () => {
  it("returns empty map for empty messages", () => {
    expect(buildChildrenMap([]).size).toBe(0);
  });

  it("maps parentId to children", () => {
    const messages = [
      msg(1),
      msg(2, 1),
      msg(3, 1),
      msg(4, 2),
    ];
    const map = buildChildrenMap(messages);
    expect([...(map.get(1) ?? [])].sort()).toEqual([2, 3]);
    expect([...(map.get(2) ?? [])]).toEqual([4]);
  });

  it("ignores messages without parentId", () => {
    const messages = [msg(1), msg(2)];
    const map = buildChildrenMap(messages);
    expect(map.size).toBe(0);
  });
});

describe("collectDescendantIds", () => {
  const messages = [
    msg(1),
    msg(2, 1),
    msg(3, 1),
    msg(4, 2),
    msg(5, 2),
    msg(6, 3),
    msg(7, 4),
  ];
  // Tree: 1→[2,3], 2→[4,5], 3→[6], 4→[7]
  const childrenByParent = buildChildrenMap(messages);
  const activeIds = new Set([1, 2, 3, 4, 5, 6, 7]);

  it("collects all descendants of starting ids", () => {
    const descendants = collectDescendantIds([1], activeIds, childrenByParent);
    expect(descendants.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("collects only descendants of a branch", () => {
    const descendants = collectDescendantIds([2], activeIds, childrenByParent);
    expect(descendants.sort()).toEqual([2, 4, 5, 7]);
  });

  it("respects activeIds boundary", () => {
    const limited = new Set([1, 2, 3, 4, 5]); // 6, 7 not active
    const descendants = collectDescendantIds([1], limited, childrenByParent);
    expect(descendants.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("returns empty for ids not in activeIds", () => {
    const descendants = collectDescendantIds([99], activeIds, childrenByParent);
    expect(descendants).toEqual([]);
  });

  it("deduplicates overlapping starting ids", () => {
    // Starting with [1, 2] — descendants of 2 are already in descendants of 1
    const descendants = collectDescendantIds([1, 2], activeIds, childrenByParent);
    expect(descendants.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("removeIdsAndDescendants", () => {
  it("removes seeds and descendants from activeIds", () => {
    const messages = [
      msg(1),
      msg(2, 1),
      msg(3, 2),
      msg(4, 2),
      msg(5),
    ];
    const childrenByParent = buildChildrenMap(messages);
    const activeIds = new Set([1, 2, 3, 4, 5]);

    const removed = removeIdsAndDescendants(activeIds, [[2, 2]], childrenByParent);
    expect(removed.sort()).toEqual([2, 3, 4]);
    expect([...activeIds].sort()).toEqual([1, 5]);
  });

  it("only removes ids present in activeIds", () => {
    const messages = [msg(1), msg(2, 1)];
    const childrenByParent = buildChildrenMap(messages);
    const activeIds = new Set([1, 2]);

    const removed = removeIdsAndDescendants(activeIds, [[3, 4]], childrenByParent);
    expect(removed).toEqual([]);
    expect([...activeIds].sort()).toEqual([1, 2]);
  });

  it("handles range input", () => {
    const messages = [
      msg(1),
      msg(2, 1),
      msg(3, 2),
      msg(4, 1),
      msg(5, 4),
    ];
    const childrenByParent = buildChildrenMap(messages);
    const activeIds = new Set([1, 2, 3, 4, 5]);

    const removed = removeIdsAndDescendants(activeIds, [[2, 4]], childrenByParent);
    expect(removed.sort()).toEqual([2, 3, 4, 5]);
    expect([...activeIds]).toEqual([1]);
  });

  it("returns empty for empty ranges", () => {
    const activeIds = new Set([1, 2, 3]);
    const childrenByParent = new Map<number, number[]>();
    const removed = removeIdsAndDescendants(activeIds, [], childrenByParent);
    expect(removed).toEqual([]);
  });
});
