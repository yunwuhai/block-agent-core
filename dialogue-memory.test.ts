// dialogue-memory.test.ts
import { describe, it, expect, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  appendTemplate, addRecipe, buildPrompt, saveTurn, queryTurns,
} from "./index.ts";
import type { TurnInput, Recipe } from "./core/types.ts";

const tmpDir = mkdtempSync("/tmp/e2e-dm-test-");

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("End-to-end dialogue memory flow", () => {
  it("setup → save turn → query → build prompt", async () => {
    const turnsPath = join(tmpDir, "turns.jsonl");
    const toolsPath = join(tmpDir, "tool-calls.jsonl");
    const templatesPath = join(tmpDir, "templates.jsonl");
    const refsPath = join(tmpDir, "file-refs.jsonl");
    const callRecordsPath = join(tmpDir, "call-records.jsonl");
    const recipePath = join(tmpDir, "recipes.toml");

    // Setup: template
    writeFileSync(join(tmpDir, "tmpl-cr.md"), "You are a code reviewer.", "utf-8");
    await appendTemplate(templatesPath, "tmpl-001", join(tmpDir, "tmpl-cr.md"), {
      path: join(tmpDir, "tmpl-cr.md"),
      tags: ["review"],
    });

    // Setup: recipe
    const recipe: Recipe = {
      id: "default",
      name: "Default",
      description: "Standard",
      zones: [
        { name: "config", description: "Cfg", position: "before", separator: "" },
        { name: "presets", description: "Pre", position: "before", separator: "---" },
        { name: "history", description: "Hist", position: "before",
          separator_before: "---history---", separator_after: "---end-history---" },
        { name: "attachments", description: "Att", position: "after", separator: "---" },
        { name: "emphasis", description: "Emp", position: "after", separator: "" },
      ],
    };
    await addRecipe(recipePath, recipe);

    // Save turn
    const turn: TurnInput = {
      userText: "Write a DB query function",
      assistantBlocks: [
        { type: "text", text: "Checking DB setup." },
        { type: "tool", toolName: "read", params: { path: "/home/project/src/db.ts" },
          content: [{ type: "text", text: "DB config" }], durationMs: 100 },
      ],
    };

    const result = await saveTurn({
      turnsPath, turnMdPath: join(tmpDir, "turns", "turn-001.md"),
      toolsPath, refsPath, callRecordsPath,
      turnId: "turn-001", toolCallIds: ["call-001"], refIds: ["ref-001"], callRecordId: "rec-001",
      turn,
      toolCalls: [{ turnId: "turn-001", toolName: "read", params: { path: "/home/project/src/db.ts" }, content: [{ type: "text", text: "DB config" }], durationMs: 100 }],
      fileRefs: [{ filePath: "/home/project/src/db.ts", turnId: "turn-001", toolCallId: "call-001", accessType: "read", handoff: "DB config" }],
      callRecord: { turnId: "turn-001", recipeId: "default",
        zones: { config: [{ file: templatesPath, id: "tmpl-001" }], presets: [], history: [], attachments: [], emphasis: [] } },
    });

    expect(result.turnRecord.id).toBe("turn-001");

    // Query
    const turns = await queryTurns(turnsPath, {});
    expect(turns).toHaveLength(1);

    // Build prompt for next turn
    const cr = {
      id: "rec-002", turnId: "turn-002", recipeId: "default",
      zones: { config: [{ file: templatesPath, id: "tmpl-001" }], presets: [],
        history: [{ file: turnsPath, id: "turn-001", mode: "handoff" as const }],
        attachments: [], emphasis: [] },
    };

    const prompt = await buildPrompt(recipePath, cr, (ref) => {
      return `[resolved: ${ref.id}]`;
    });

    expect(prompt).toContain("{{CURRENT_TURN}}");
    expect(prompt).toContain("[resolved: tmpl-001]");

    const turnIdx = prompt.indexOf("{{CURRENT_TURN}}");
    expect(prompt.indexOf("[resolved: tmpl-001]")).toBeLessThan(turnIdx);
  });
});


