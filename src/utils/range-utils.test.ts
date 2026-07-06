import { describe, expect, it } from "bun:test";
import { toNumberRanges, fromNumberRanges, normalizeRanges } from "./range-utils.ts";

describe("toNumberRanges", () => {
  it("returns empty for empty input", () => {
    expect(toNumberRanges([])).toEqual([]);
  });

  it("compresses consecutive numbers into ranges", () => {
    expect(toNumberRanges([1, 2, 3, 5, 6, 8])).toEqual([
      [1, 3],
      [5, 6],
      [8, 8],
    ]);
  });

  it("handles single element", () => {
    expect(toNumberRanges([42])).toEqual([[42, 42]]);
  });

  it("deduplicates input", () => {
    expect(toNumberRanges([1, 1, 2, 2, 3])).toEqual([[1, 3]]);
  });

  it("sorts unsorted input", () => {
    expect(toNumberRanges([5, 1, 3, 2])).toEqual([
      [1, 3],
      [5, 5],
    ]);
  });

  it("handles non-consecutive ranges", () => {
    expect(toNumberRanges([1, 3, 5, 7])).toEqual([
      [1, 1],
      [3, 3],
      [5, 5],
      [7, 7],
    ]);
  });

  it("handles long consecutive run", () => {
    const input = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(toNumberRanges(input)).toEqual([[1, 100]]);
  });
});

describe("fromNumberRanges", () => {
  it("returns empty for non-array input", () => {
    expect(fromNumberRanges(null)).toEqual([]);
    expect(fromNumberRanges("foo")).toEqual([]);
    expect(fromNumberRanges(undefined)).toEqual([]);
  });

  it("expands ranges to individual numbers", () => {
    expect(fromNumberRanges([[1, 3], [5, 6]])).toEqual([1, 2, 3, 5, 6]);
  });

  it("skips invalid range entries", () => {
    expect(fromNumberRanges([[1, 3], null, "bad", [5, 6]])).toEqual([1, 2, 3, 5, 6]);
  });

  it("skips reversed ranges (start > end)", () => {
    expect(fromNumberRanges([[5, 2]])).toEqual([]);
  });

  it("skips non-integer bounds", () => {
    expect(fromNumberRanges([[1.5, 3]])).toEqual([]);
  });

  it("handles single-element range", () => {
    expect(fromNumberRanges([[7, 7]])).toEqual([7]);
  });

  it("handles empty array", () => {
    expect(fromNumberRanges([])).toEqual([]);
  });
});

describe("normalizeRanges", () => {
  it("returns compressed ranges from raw input", () => {
    // fromNumberRanges expands, toNumberRanges compresses back
    expect(normalizeRanges([[1, 3], [4, 6]])).toEqual([[1, 6]]);
  });

  it("returns empty for invalid input", () => {
    expect(normalizeRanges(null)).toEqual([]);
  });

  it("deduplicates overlapping expanded values", () => {
    expect(normalizeRanges([[1, 5], [4, 8]])).toEqual([[1, 8]]);
  });
});

describe("round-trip", () => {
  it("toNumberRanges -> fromNumberRanges is identity after dedup/sort", () => {
    const input = [5, 3, 1, 2, 2, 5];
    const ranges = toNumberRanges(input);
    const output = fromNumberRanges(ranges);
    expect([...new Set(output)].sort((a, b) => a - b)).toEqual([1, 2, 3, 5]);
  });
});
