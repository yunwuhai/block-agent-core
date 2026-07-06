import { describe, it, expect, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { saveTurn } from "./save-turn.ts";
import type { TurnInput } from "./types.ts";

const tmpDir = mkdtempSync(join(tmpdir(), "saveturn-test-"));

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("saveTurn", () => {
  it("saves a complete turn with all related records", async () => {
    const turn: TurnInput = {
      userText: "Write a database query function",
      assistantBlocks: [
        { type: "text", text: "I'll check the existing database setup." },
        {
          type: "tool", toolName: "read",
          params: { path: "/home/project/src/db.ts" },
          content: [{ type: "text", text: "import { createPool } from 'pg';" }],
          durationMs: 120,
        },
        { type: "text", text: "Now I'll write the query function." },
      ],
    };

    const result = await saveTurn({
      turnsPath: join(tmpDir, "turns.jsonl"),
      turnMdPath: join(tmpDir, "turns", "turn-001.md"),
      toolsPath: join(tmpDir, "tool-calls.jsonl"),
      refsPath: join(tmpDir, "file-refs.jsonl"),
      callRecordsPath: join(tmpDir, "call-records.jsonl"),
      turnId: "turn-001",
      toolCallIds: ["call-001"],
      refIds: ["ref-001"],
      callRecordId: "rec-001",
      turn,
      toolCalls: [{
        turnId: "turn-001", toolName: "read",
        params: { path: "/home/project/src/db.ts" },
        content: [{ type: "text", text: "import { createPool } from 'pg';" }],
        durationMs: 120,
      }],
      fileRefs: [{
        filePath: "/home/project/src/db.ts", turnId: "turn-001",
        toolCallId: "call-001", accessType: "read",
        handoff: "Database connection configuration",
      }],
      callRecord: {
        turnId: "turn-001", recipeId: "default-context",
        zones: { config: [], presets: [], history: [], attachments: [], emphasis: [] },
      },
    });

    expect(result.turnRecord.id).toBe("turn-001");
    expect(result.toolCallRecords).toHaveLength(1);
    expect(result.fileRefRecords).toHaveLength(1);

    const mdContent = await readFile(join(tmpDir, "turns", "turn-001.md"), "utf-8");
    expect(mdContent).toContain("## User");
    expect(mdContent).toContain("Write a database query function");
    expect(mdContent).toContain("## Assistant (tool: read)");
  });
});
