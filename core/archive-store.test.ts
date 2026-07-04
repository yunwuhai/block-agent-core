import { afterAll, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createArchiveLayout, saveSubagentResult } from "./archive-store.ts";
import { readJsonl } from "../utils/jsonl.ts";

const tmpDir = mkdtempSync(join(process.cwd(), ".tmp-archive-store-test-"));

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("archive store", () => {
  it("stores messages, tool traces, and external file access separately", async () => {
    const layout = createArchiveLayout(join(tmpDir, "run-001"));

    const result = await saveSubagentResult(layout, {
      messages: [
        { id: "msg-1", kind: "reasoning", text: "thinking", sequence: 1 },
        { id: "msg-2", kind: "reply", text: "final answer", sequence: 2 },
      ],
      toolCalls: [
        {
          id: "tool-1",
          messageId: "msg-2",
          toolName: "read_file",
          params: { path: "/tmp/a.ts" },
          result: { ok: true },
        },
      ],
      externalFiles: [
        {
          id: "file-1",
          filePath: "/tmp/a.ts",
          accessType: "read",
          messageId: "msg-2",
          toolCallId: "tool-1",
        },
      ],
    });

    const messages = await readJsonl<{ id: string; kind: string }>(layout.messagesPath);
    expect(messages.map(message => message.kind)).toEqual(["reasoning", "reply"]);

    expect(result.toolCallPaths).toHaveLength(1);
    expect(existsSync(result.toolCallPaths[0]!)).toBe(true);
    expect(readFileSync(result.toolCallPaths[0]!, "utf-8")).toContain("\"toolName\": \"read_file\"");

    const externalFiles = await readJsonl<{ id: string; toolCallId?: string }>(layout.externalFilesPath);
    expect(externalFiles).toHaveLength(1);
    expect(externalFiles[0]!.toolCallId).toBe("tool-1");
  });
});
