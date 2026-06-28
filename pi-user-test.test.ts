// pi-user-test.test.ts
// PI 扩展用户综合测试 — 模拟安装验证 + API 流程测试
// 作者: 测试角色 "PI 扩展用户"
// 日期: 2026-06-28

import { describe, it, expect, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ============================================================================
// Core CRUD API — 验证导入和基本增删查改
// ============================================================================

import {
  // Turns
  appendTurn, getTurn, queryTurns, updateTurn,
  // Tool calls
  appendToolCall, getToolCall, queryToolCalls, updateToolCall,
  // Templates
  appendTemplate, getTemplate, queryTemplates, updateTemplate,
  // File refs
  appendFileRef, getFileRef, queryFileRefs, updateFileRef,
  // Call records
  appendCallRecord, queryCallRecords,
  // Recipes
  loadRecipes, getRecipe, addRecipe, updateRecipe,
  // Prompt building
  buildPrompt, buildPromptFromRecipe,
  // Save turn
  saveTurn,
  // Types
  type TurnInput, type Recipe,
  type CallRecord,
  type SavedTurn,
} from "./index.ts";

// ============================================================================
// Test infrastructure
// ============================================================================

const tmpDir = mkdtempSync("/tmp/pi-user-test-");
const turnsPath = join(tmpDir, "turns.jsonl");
const toolsPath = join(tmpDir, "tool-calls.jsonl");
const templatesPath = join(tmpDir, "templates.jsonl");
const refsPath = join(tmpDir, "file-refs.jsonl");
const callRecordsPath = join(tmpDir, "call-records.jsonl");
const recipePath = join(tmpDir, "recipes.toml");

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ============================================================================
// Test Suite 1: CRUD — 对话轮次 (Turns)
// ============================================================================

describe("CRUD: Turns", () => {
  it("appendTurn creates a turn record", async () => {
    const turn: TurnInput = {
      userText: "What is the project about?",
      assistantBlocks: [
        { type: "text", text: "It is a PI Coding Agent extension." },
      ],
    };
    const record = await appendTurn(turnsPath, "turn-001", join(tmpDir, "turn-001.md"), turn);
    expect(record.id).toBe("turn-001");
    expect(record.path).toContain("turn-001.md");
  });

  it("getTurn retrieves by ID", async () => {
    const record = await getTurn(turnsPath, "turn-001");
    expect(record).not.toBeNull();
    expect(record!.id).toBe("turn-001");
  });

  it("getTurn returns null for missing ID", async () => {
    const record = await getTurn(turnsPath, "turn-999");
    expect(record).toBeNull();
  });

  it("queryTurns returns all records when no filter", async () => {
    const records = await queryTurns(turnsPath, {});
    expect(records.length).toBeGreaterThanOrEqual(1);
  });

  it("queryTurns filters by tags (OR logic)", async () => {
    // Add a second turn with tags
    await appendTurn(turnsPath, "turn-002", join(tmpDir, "turn-002.md"), {
      userText: "Second turn",
      assistantBlocks: [],
    });
    // Update it with tags
    await updateTurn(turnsPath, "turn-002", { tags: ["bug", "urgent"] });

    const tagged = await queryTurns(turnsPath, { tags: ["bug"] });
    expect(tagged).toHaveLength(1);
    expect(tagged[0]!.id).toBe("turn-002");
  });

  it("updateTurn patches handoff and tags", async () => {
    const ok = await updateTurn(turnsPath, "turn-001", {
      handoff: "Completed summary of project",
      tags: ["onboarding"],
    });
    expect(ok).toBe(true);

    const updated = await getTurn(turnsPath, "turn-001");
    expect(updated!.handoff).toBe("Completed summary of project");
    expect(updated!.tags).toEqual(["onboarding"]);
  });

  it("updateTurn returns false for missing ID", async () => {
    const ok = await updateTurn(turnsPath, "turn-999", { handoff: "nope" });
    expect(ok).toBe(false);
  });
});

// ============================================================================
// Test Suite 2: CRUD — 工具调用 (Tool Calls)
// ============================================================================

describe("CRUD: Tool Calls", () => {
  it("appendToolCall creates a record", async () => {
    const record = await appendToolCall(toolsPath, "call-001", {
      turnId: "turn-001",
      toolName: "read",
      params: { path: "/tmp/test.txt" },
      content: [{ type: "text", text: "file content here" }],
      durationMs: 50,
    });
    expect(record.id).toBe("call-001");
    expect(record.toolName).toBe("read");
    expect(record.durationMs).toBe(50);
  });

  it("getToolCall returns record", async () => {
    const record = await getToolCall(toolsPath, "call-001");
    expect(record).not.toBeNull();
    expect(record!.toolName).toBe("read");
  });

  it("queryToolCalls filters by turnId", async () => {
    // Add another call for different turn
    await appendToolCall(toolsPath, "call-002", {
      turnId: "turn-002",
      toolName: "write",
      params: { path: "/tmp/output.txt" },
      content: [{ type: "text", text: "written" }],
    });

    const calls = await queryToolCalls(toolsPath, { turnId: "turn-002" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.toolName).toBe("write");
  });

  it("queryToolCalls filters by toolName", async () => {
    const calls = await queryToolCalls(toolsPath, { toolName: "read" });
    expect(calls).toHaveLength(1);
  });

  it("updateToolCall patches fields", async () => {
    const ok = await updateToolCall(toolsPath, "call-001", { error: true, durationMs: 999 });
    expect(ok).toBe(true);
    const updated = await getToolCall(toolsPath, "call-001");
    expect(updated!.error).toBe(true);
    expect(updated!.durationMs).toBe(999);
  });
});

// ============================================================================
// Test Suite 3: CRUD — 模板 (Templates)
// ============================================================================

describe("CRUD: Templates", () => {
  it("appendTemplate creates a record", async () => {
    const tmplMdPath = join(tmpDir, "tmpl-review.md");
    writeFileSync(tmplMdPath, "You are a code reviewer.", "utf-8");

    const record = await appendTemplate(templatesPath, "tmpl-001", tmplMdPath, {
      path: tmplMdPath,
      tags: ["review", "coding"],
    });
    expect(record.id).toBe("tmpl-001");
    expect(record.tags).toContain("review");
  });

  it("queryTemplates filters by tags", async () => {
    const records = await queryTemplates(templatesPath, { tags: ["coding"] });
    expect(records.length).toBeGreaterThanOrEqual(1);
  });

  it("getTemplate returns specific record", async () => {
    const record = await getTemplate(templatesPath, "tmpl-001");
    expect(record).not.toBeNull();
    expect(record!.id).toBe("tmpl-001");
  });

  it("updateTemplate patches tags", async () => {
    const ok = await updateTemplate(templatesPath, "tmpl-001", {
      tags: ["review", "coding", "updated"],
    });
    expect(ok).toBe(true);
    const updated = await getTemplate(templatesPath, "tmpl-001");
    expect(updated!.tags).toContain("updated");
  });
});

// ============================================================================
// Test Suite 4: CRUD — 文件引用 (File Refs)
// ============================================================================

describe("CRUD: File Refs", () => {
  it("appendFileRef creates a record", async () => {
    const record = await appendFileRef(refsPath, "ref-001", {
      filePath: "/home/project/src/main.ts",
      turnId: "turn-001",
      toolCallId: "call-001",
      accessType: "read",
      handoff: "Read main file",
    });
    expect(record.id).toBe("ref-001");
    expect(record.accessType).toBe("read");
  });

  it("queryFileRefs filters by accessType", async () => {
    // Add a write ref
    await appendFileRef(refsPath, "ref-002", {
      filePath: "/home/project/tests/test-main.ts",
      turnId: "turn-001",
      toolCallId: "call-002",
      accessType: "write",
    });

    const reads = await queryFileRefs(refsPath, { accessType: "read" });
    expect(reads).toHaveLength(1);
    expect(reads[0]!.id).toBe("ref-001");

    const writes = await queryFileRefs(refsPath, { accessType: "write" });
    expect(writes).toHaveLength(1);
    expect(writes[0]!.id).toBe("ref-002");
  });

  it("queryFileRefs filters by glob filePath", async () => {
    const refs = await queryFileRefs(refsPath, { filePath: "/home/project/src/**" });
    expect(refs).toHaveLength(1);
    expect(refs[0]!.filePath).toBe("/home/project/src/main.ts");
  });

  it("updateFileRef patches fields", async () => {
    const ok = await updateFileRef(refsPath, "ref-001", { handoff: "Updated summary" });
    expect(ok).toBe(true);
    const updated = await getFileRef(refsPath, "ref-001");
    expect(updated!.handoff).toBe("Updated summary");
  });
});

// ============================================================================
// Test Suite 5: CRUD — 调用记录 (Call Records)
// ============================================================================

describe("CRUD: Call Records", () => {
  it("appendCallRecord creates a record", async () => {
    const record = await appendCallRecord(callRecordsPath, "rec-001", {
      turnId: "turn-001",
      recipeId: "default",
      zones: { config: [{ file: templatesPath, id: "tmpl-001" }], presets: [], history: [] },
    });
    expect(record.id).toBe("rec-001");
    expect(record.recipeId).toBe("default");
    expect(record.zones.config).toHaveLength(1);
  });

  it("queryCallRecords filters by recipeId", async () => {
    // Add another for different recipe
    await appendCallRecord(callRecordsPath, "rec-002", {
      turnId: "turn-002",
      recipeId: "minimal",
      zones: {},
    });

    const records = await queryCallRecords(callRecordsPath, { recipeId: "default" });
    expect(records).toHaveLength(1);
  });
});

// ============================================================================
// Test Suite 6: Recipe System + Prompt Building
// ============================================================================

describe("Recipe System + Prompt Building", () => {
  it("loadRecipes returns empty list when file missing", async () => {
    const recipes = await loadRecipes(join(tmpDir, "nonexistent.toml"));
    expect(recipes).toEqual([]);
  });

  it("addRecipe writes a recipe to TOML", async () => {
    const recipe: Recipe = {
      id: "default",
      name: "Default Recipe",
      description: "Standard context assembly",
      zones: [
        { name: "config", description: "Configuration", position: "before", separator: "\n" },
        { name: "presets", description: "Presets", position: "before", separator: "---" },
        { name: "history", description: "History", position: "before",
          separator_before: "=== HISTORY ===", separator_after: "=== END HISTORY ===" },
        { name: "attachments", description: "Attachments", position: "after", separator: "---" },
      ],
    };
    await addRecipe(recipePath, recipe);

    const loaded = await loadRecipes(recipePath);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.id).toBe("default");
  });

  it("addRecipe appends to existing recipes", async () => {
    const recipe2: Recipe = {
      id: "minimal",
      name: "Minimal",
      description: "No frills",
      zones: [{ name: "body", description: "Body", position: "before", separator: "" }],
    };
    await addRecipe(recipePath, recipe2);

    const loaded = await loadRecipes(recipePath);
    expect(loaded).toHaveLength(2);
  });

  it("getRecipe returns specific recipe by id", async () => {
    const recipe = await getRecipe(recipePath, "default");
    expect(recipe).not.toBeNull();
    expect(recipe!.name).toBe("Default Recipe");
  });

  it("getRecipe returns null for missing id", async () => {
    const recipe = await getRecipe(recipePath, "nonexistent");
    expect(recipe).toBeNull();
  });

  it("updateRecipe patches a recipe's fields", async () => {
    const ok = await updateRecipe(recipePath, "default", { description: "Updated description" });
    expect(ok).toBe(true);
    const updated = await getRecipe(recipePath, "default");
    expect(updated!.description).toBe("Updated description");
  });

  it("buildPromptFromRecipe assembles prompt with zones before and after", () => {
    const recipe: Recipe = {
      id: "test",
      name: "Test Recipe",
      description: "Test",
      zones: [
        { name: "header", description: "Header", position: "before", separator: "\n" },
        { name: "footer", description: "Footer", position: "after", separator: "\n" },
      ],
    };

    const resolver = (ref: { id: string }) => `[content-of-${ref.id}]`;

    const callRecord: CallRecord = {
      id: "rec-test",
      turnId: "turn-test",
      recipeId: "test",
      zones: {
        header: [{ file: "f1", id: "entry-1" }, { file: "f2", id: "entry-2" }],
        footer: [{ file: "f3", id: "entry-3" }],
      },
    };

    const prompt = buildPromptFromRecipe(recipe, callRecord, resolver);
    expect(prompt).toContain("{{CURRENT_TURN}}");
    expect(prompt).toContain("[content-of-entry-1]");
    expect(prompt).toContain("[content-of-entry-2]");
    expect(prompt).toContain("[content-of-entry-3]");

    // Header (before) should appear before {{CURRENT_TURN}}
    const headerIdx = prompt.indexOf("[content-of-entry-1]");
    const currentTurnIdx = prompt.indexOf("{{CURRENT_TURN}}");
    const footerIdx = prompt.indexOf("[content-of-entry-3]");
    expect(headerIdx).toBeLessThan(currentTurnIdx);
    expect(footerIdx).toBeGreaterThan(currentTurnIdx);
  });

  it("buildPrompt reads TOML and resolves recipe", async () => {
    const resolver = (ref: { id: string }) => `[resolved-${ref.id}]`;

    const callRecord: CallRecord = {
      id: "rec-prompt",
      turnId: "turn-prompt",
      recipeId: "default",
      zones: {
        config: [{ file: templatesPath, id: "tmpl-001" }],
        presets: [],
        history: [],
        attachments: [],
      },
    };

    const prompt = await buildPrompt(recipePath, callRecord, resolver);
    expect(prompt).toContain("{{CURRENT_TURN}}");
    expect(prompt).toContain("[resolved-tmpl-001]");
  });

  it("buildPrompt throws for missing recipe", async () => {
    const resolver = (_ref: { id: string }) => "";
    const badCallRecord: CallRecord = {
      id: "rec-bad",
      turnId: "turn-bad",
      recipeId: "nonexistent-recipe",
      zones: {},
    };
    try {
      await buildPrompt(recipePath, badCallRecord, resolver);
      // Should not reach here
      expect(true).toBe(false);
    } catch (e) {
      expect((e as Error).message).toContain("nonexistent-recipe");
    }
  });
});

// ============================================================================
// Test Suite 7: saveTurn Orchestration
// ============================================================================

describe("saveTurn — one-shot turn persistence", () => {
  it("saveTurn creates MD file and all records", async () => {
    const turn: TurnInput = {
      userText: "Implement the database query function",
      assistantBlocks: [
        {
          type: "text",
          text: "Let me check the current database setup first.",
        },
        {
          type: "tool",
          toolName: "read",
          params: { path: "/home/project/src/db.ts" },
          content: [{ type: "text", text: "// db config\nconst pool = new Pool()" }],
          durationMs: 120,
        },
        {
          type: "text",
          text: "I found the DB config. Now writing the query function.",
        },
        {
          type: "tool",
          toolName: "write",
          params: { path: "/home/project/src/query.ts" },
          content: [{ type: "text", text: "// query function written" }],
          details: { lines: 42 },
          durationMs: 200,
        },
      ],
    };

    const result: SavedTurn = await saveTurn({
      turnsPath,
      turnMdPath: join(tmpDir, "turns", "turn-003.md"),
      toolsPath,
      refsPath,
      callRecordsPath,
      turnId: "turn-003",
      toolCallIds: ["call-003", "call-004"],
      refIds: ["ref-003", "ref-004"],
      callRecordId: "rec-003",
      turn,
      toolCalls: [
        {
          turnId: "turn-003",
          toolName: "read",
          params: { path: "/home/project/src/db.ts" },
          content: [{ type: "text", text: "// db config" }],
          durationMs: 120,
        },
        {
          turnId: "turn-003",
          toolName: "write",
          params: { path: "/home/project/src/query.ts" },
          content: [{ type: "text", text: "// query function" }],
          details: { lines: 42 },
          durationMs: 200,
        },
      ],
      fileRefs: [
        {
          filePath: "/home/project/src/db.ts",
          turnId: "turn-003",
          toolCallId: "call-003",
          accessType: "read",
          handoff: "DB pool config",
        },
        {
          filePath: "/home/project/src/query.ts",
          turnId: "turn-003",
          toolCallId: "call-004",
          accessType: "write",
          handoff: "Query function implementation",
        },
      ],
      callRecord: {
        turnId: "turn-003",
        recipeId: "default",
        zones: {
          config: [{ file: templatesPath, id: "tmpl-001" }],
          presets: [],
          history: [],
          attachments: [],
        },
      },
    });

    // Verify turn record
    expect(result.turnRecord.id).toBe("turn-003");

    // Verify tool call records
    expect(result.toolCallRecords).toHaveLength(2);
    expect(result.toolCallRecords[0]!.toolName).toBe("read");
    expect(result.toolCallRecords[1]!.toolName).toBe("write");

    // Verify file ref records
    expect(result.fileRefRecords).toHaveLength(2);
    expect(result.fileRefRecords[0]!.accessType).toBe("read");
    expect(result.fileRefRecords[1]!.accessType).toBe("write");

    // Verify call record
    expect(result.callRecord.recipeId).toBe("default");

    // Verify MD file was created
    const mdContent = readFileSync(result.turnMdPath, "utf-8");
    expect(mdContent).toContain("## User");
    expect(mdContent).toContain("Implement the database query function");
    expect(mdContent).toContain("## Assistant (tool: read)");
    expect(mdContent).toContain("## Assistant (tool: write)");
    expect(mdContent).toContain("// db config");
  });
});

// ============================================================================
// Test Suite 9: Complete Conversation Memory Flow (End-to-End)
// ============================================================================

describe("Complete conversation memory flow (simulated multi-turn)", () => {
  it("Turn 1: User asks about project, assistant reads config", async () => {
    const turn1: TurnInput = {
      userText: "What is this project about?",
      assistantBlocks: [
        {
          type: "tool",
          toolName: "read",
          params: { path: "/home/project/README.md" },
          content: [{ type: "text", text: "# Better Subagent\nPI extension" }],
          durationMs: 30,
        },
        { type: "text", text: "This is a PI Coding Agent extension." },
      ],
    };

    const result = await saveTurn({
      turnsPath,
      turnMdPath: join(tmpDir, "turns", "turn-010.md"),
      toolsPath, refsPath, callRecordsPath,
      turnId: "turn-010",
      toolCallIds: ["call-010"],
      refIds: ["ref-010"],
      callRecordId: "rec-010",
      turn: turn1,
      toolCalls: [{
        turnId: "turn-010",
        toolName: "read",
        params: { path: "/home/project/README.md" },
        content: [{ type: "text", text: "# Better Subagent\nPI extension" }],
        durationMs: 30,
      }],
      fileRefs: [{
        filePath: "/home/project/README.md",
        turnId: "turn-010",
        toolCallId: "call-010",
        accessType: "read",
        handoff: "Project README content",
      }],
      callRecord: {
        turnId: "turn-010",
        recipeId: "default",
        zones: { config: [], presets: [], history: [], attachments: [] },
      },
    });

    expect(result.turnRecord.id).toBe("turn-010");
    expect(result.toolCallRecords).toHaveLength(1);
    expect(result.fileRefRecords).toHaveLength(1);
  });

  it("Turn 2: User asks to write code, assistant uses context from Turn 1", async () => {
    const turn2: TurnInput = {
      userText: "Write a greeting function in TypeScript",
      assistantBlocks: [
        {
          type: "tool",
          toolName: "read",
          params: { path: "/home/project/src/helper.ts" },
          content: [{ type: "text", text: "// existing helpers" }],
          durationMs: 15,
        },
        {
          type: "tool",
          toolName: "write",
          params: { path: "/home/project/src/greet.ts" },
          content: [{ type: "text", text: 'export function greet(name: string) { return `Hello, ${name}!`; }' }],
          durationMs: 100,
        },
        { type: "text", text: "Done! Wrote the greet function." },
      ],
    };

    const result = await saveTurn({
      turnsPath,
      turnMdPath: join(tmpDir, "turns", "turn-011.md"),
      toolsPath, refsPath, callRecordsPath,
      turnId: "turn-011",
      toolCallIds: ["call-011", "call-012"],
      refIds: ["ref-011", "ref-012"],
      callRecordId: "rec-011",
      turn: turn2,
      toolCalls: [
        {
          turnId: "turn-011",
          toolName: "read",
          params: { path: "/home/project/src/helper.ts" },
          content: [{ type: "text", text: "// existing helpers" }],
          durationMs: 15,
        },
        {
          turnId: "turn-011",
          toolName: "write",
          params: { path: "/home/project/src/greet.ts" },
          content: [{ type: "text", text: "// greet function" }],
          durationMs: 100,
        },
      ],
      fileRefs: [
        {
          filePath: "/home/project/src/helper.ts",
          turnId: "turn-011",
          toolCallId: "call-011",
          accessType: "read",
          handoff: "Existing helpers",
        },
        {
          filePath: "/home/project/src/greet.ts",
          turnId: "turn-011",
          toolCallId: "call-012",
          accessType: "write",
          handoff: "New greet function",
        },
      ],
      callRecord: {
        turnId: "turn-011",
        recipeId: "default",
        zones: {
          config: [{ file: templatesPath, id: "tmpl-001" }],
          history: [{ file: turnsPath, id: "turn-010", mode: "handoff" }],
          presets: [],
          attachments: [],
        },
      },
    });

    expect(result.turnRecord.id).toBe("turn-011");
    expect(result.toolCallRecords).toHaveLength(2);
  });

  it("Query all turns and cross-reference tool calls", async () => {
    const allTurns = await queryTurns(turnsPath, {});
    // We have created many turns throughout this test
    expect(allTurns.length).toBeGreaterThanOrEqual(5);

    // Find the two conversation flow turns
    const turn10 = await getTurn(turnsPath, "turn-010");
    expect(turn10).not.toBeNull();

    const turn11 = await getTurn(turnsPath, "turn-011");
    expect(turn11).not.toBeNull();

    // Query tool calls for turn-011
    const calls = await queryToolCalls(toolsPath, { turnId: "turn-011" });
    expect(calls).toHaveLength(2);
    expect(calls.map(c => c.toolName)).toEqual(["read", "write"]);
  });

  it("Build prompt for Turn 3 using history from previous turns", async () => {
    const resolver = (ref: { file: string; id: string; mode?: string }) => {
      if (ref.mode === "handoff") {
        return `[HANDOFF: ${ref.id}]`;
      }
      return `[CONTENT: ${ref.id}]`;
    };

    const nextCallRecord: CallRecord = {
      id: "rec-012",
      turnId: "turn-012",
      recipeId: "default",
      zones: {
        config: [{ file: templatesPath, id: "tmpl-001" }],
        history: [
          { file: turnsPath, id: "turn-010", mode: "handoff" },
          { file: turnsPath, id: "turn-011", mode: "handoff" },
        ],
        presets: [],
        attachments: [],
      },
    };

    const prompt = await buildPrompt(recipePath, nextCallRecord, resolver);
    expect(prompt).toContain("{{CURRENT_TURN}}");
    expect(prompt).toContain("[HANDOFF: turn-010]");
    expect(prompt).toContain("[HANDOFF: turn-011]");
    expect(prompt).toContain("[CONTENT: tmpl-001]");

    // Template should be in "before" zones, history should also be "before"
    // Both appear before {{CURRENT_TURN}}
    const beforeCurrentTurn = prompt.substring(0, prompt.indexOf("{{CURRENT_TURN}}"));
    expect(beforeCurrentTurn).toContain("tmpl-001");
    expect(beforeCurrentTurn).toContain("turn-010");
  });
});
