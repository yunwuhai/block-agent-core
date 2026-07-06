// core/build-prompt.test.ts
import { describe, it, expect } from "bun:test";
import { buildPromptFromRecipe } from "./build-prompt.ts";
import type { CallRecord, Recipe, Ref } from "./types.ts";

const sampleRecipe: Recipe = {
  id: "default-context",
  name: "Default",
  description: "Standard assembly",
  zones: [
    { name: "config", description: "Config zone", position: "before", separator: "" },
    { name: "presets", description: "Preset prompts", position: "before", separator: "---presets---" },
    {
      name: "history",
      description: "History turns",
      position: "before",
      separator_before: "---context start---",
      separator_after: "---context end---",
    },
    { name: "attachments", description: "File attachments", position: "after", separator: "---attachment---" },
    { name: "emphasis", description: "Emphasis at end", position: "after", separator: "" },
  ],
};

function testResolver(ref: Ref): string {
  if (ref.mode === "handoff") return `[handoff: ${ref.id}]`;
  if (ref.lines) return `[content of ${ref.id} lines ${ref.lines}]`;
  return `[content of ${ref.id}]`;
}

describe("buildPromptFromRecipe", () => {
  it("assembles before and after zones around CURRENT_TURN", () => {
    const callRecord: CallRecord = {
      id: "rec-001", turnId: "turn-001", recipeId: "default-context",
      zones: {
        config: [{ file: "/data/templates.jsonl", id: "tmpl-001" }],
        presets: [
          { file: "/data/templates.jsonl", id: "tmpl-002" },
          { file: "/data/templates.jsonl", id: "tmpl-003" },
        ],
        history: [{ file: "/data/turns.jsonl", id: "turn-000", mode: "handoff" }],
        attachments: [{ file: "/data/refs.jsonl", id: "ref-001" }],
        emphasis: [],
      },
    };

    const result = buildPromptFromRecipe(sampleRecipe, callRecord, testResolver);

    expect(result).toContain("{{CURRENT_TURN}}");
    expect(result).toContain("[content of tmpl-001]");
    expect(result).toContain("[handoff: turn-000]");
    expect(result).toContain("[content of ref-001]");

    const turnIndex = result.indexOf("{{CURRENT_TURN}}");
    expect(result.indexOf("[content of tmpl-001]")).toBeLessThan(turnIndex);
    expect(result.indexOf("[content of ref-001]")).toBeGreaterThan(turnIndex);

    expect(result).toContain("---presets---");
    expect(result).toContain("---context start---");
    expect(result).toContain("---context end---");
  });

  it("handles empty zones", () => {
    const callRecord: CallRecord = {
      id: "rec-002", turnId: "turn-001", recipeId: "default-context",
      zones: { config: [], presets: [], history: [], attachments: [], emphasis: [] },
    };
    const result = buildPromptFromRecipe(sampleRecipe, callRecord, testResolver);
    expect(result.trim()).toBe("{{CURRENT_TURN}}");
  });

  it("handles zones not present in callRecord", () => {
    const callRecord: CallRecord = {
      id: "rec-003", turnId: "turn-001", recipeId: "default-context",
      zones: { config: [{ file: "/data/templates.jsonl", id: "tmpl-001" }] },
    };
    const result = buildPromptFromRecipe(sampleRecipe, callRecord, testResolver);
    expect(result).toContain("[content of tmpl-001]");
    expect(result).toContain("{{CURRENT_TURN}}");
  });

  it("applies lines parameter in resolver", () => {
    const callRecord: CallRecord = {
      id: "rec-004", turnId: "turn-001", recipeId: "default-context",
      zones: { config: [], presets: [], history: [],
        attachments: [{ file: "/data/refs.jsonl", id: "ref-001", lines: "1-80" }], emphasis: [] },
    };
    const result = buildPromptFromRecipe(sampleRecipe, callRecord, testResolver);
    expect(result).toContain("[content of ref-001 lines 1-80]");
  });
});
