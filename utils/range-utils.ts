export function toNumberRanges(numbers: number[]): number[][] {
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

export function fromNumberRanges(ranges: unknown): number[] {
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

export function normalizeRanges(ranges: unknown): number[][] {
  return toNumberRanges(fromNumberRanges(ranges));
}
