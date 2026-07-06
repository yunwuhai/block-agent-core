import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createArchiveLayout, saveSubagentResult } from "./archive-store.ts";
import { readJsonl } from "../utils/jsonl.ts";

const tmpDir = mkdtempSync(join(process.cwd(), ".tmp-archive-store-test-"));

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("archive store", () => {
  it("stores messages, tool traces, and external file access in JSONL files", async () => {
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

    const toolCalls = await readJsonl<{ toolName: string }>(layout.toolCallsPath);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]!.toolName).toBe("read_file");

    const fileCalls = await readJsonl<{ toolCallId?: string }>(layout.fileCallsPath);
    expect(fileCalls[0]!.toolCallId).toBe("tool-1");

    expect(result.toolCallsPath).toBe(layout.toolCallsPath);
  });
});
