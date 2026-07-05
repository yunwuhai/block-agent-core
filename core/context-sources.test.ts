import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  composeContext,
  createContextLoaderRegistry,
  loadContextSource,
  loadJsonlFieldsSource,
} from "./context-sources.ts";
import { appendJsonl } from "../utils/jsonl.ts";

const tmpDir = mkdtempSync(join(process.cwd(), ".tmp-context-sources-test-"));

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("context sources", () => {
  it("loads JSONL fields in injected field order", async () => {
    const jsonlPath = join(tmpDir, "messages.jsonl");
    await appendJsonl(jsonlPath, { id: "msg-1", role: "user", body: "hello" });
    await appendJsonl(jsonlPath, { id: "msg-2", role: "assistant", body: "world" });

    const content = await loadJsonlFieldsSource({
      type: "jsonl-fields",
      filePath: jsonlPath,
      fieldOrder: ["role", "body"],
      valueSeparator: ": ",
      recordSeparator: "\n",
    });

    expect(content).toBe("user: hello\nassistant: world");
  });

  it("filters JSONL records by sequence range and tags", async () => {
    const jsonlPath = join(tmpDir, "tagged-messages.jsonl");
    await appendJsonl(jsonlPath, { id: "msg-1", sequence: 1, text: "one", tags: ["summary"] });
    await appendJsonl(jsonlPath, { id: "msg-2", sequence: 2, text: "two", tags: ["debug"] });
    await appendJsonl(jsonlPath, { id: "msg-3", sequence: 3, text: "three", tags: ["summary", "debug"] });

    const content = await loadContextSource({
      type: "jsonl-fields",
      filePath: jsonlPath,
      fieldNames: ["text"],
      startSequence: 2,
      endSequence: 3,
      tags: ["summary"],
    });

    expect(content).toBe("three");
  });

  it("expands message references into tool and file call payloads", async () => {
    const dir = join(tmpDir, "expanded");
    const messagesPath = join(dir, "messages.jsonl");
    const toolCallsPath = join(dir, "tool-calls.jsonl");
    const fileCallsPath = join(dir, "file-calls.jsonl");

    await appendJsonl(messagesPath, { seq: 1, kind: "tool_call", toolCallSeq: 1 });
    await appendJsonl(messagesPath, { seq: 2, kind: "file_call", fileCallSeq: 1 });
    await appendJsonl(toolCallsPath, { seq: 1, toolName: "read", params: { path: "/tmp/a.ts" }, result: { ok: true } });
    await appendJsonl(fileCallsPath, { seq: 1, filePath: "/tmp/a.ts" });

    const content = await loadContextSource({
      type: "jsonl-fields",
      filePath: messagesPath,
      startSequence: 1,
      endSequence: 2,
      expandReferences: true,
    });

    expect(content).toContain("Tool: read");
    expect(content).toContain("Result:");
    expect(content).toContain("File: /tmp/a.ts");
  });

  it("supports pluggable custom loaders", async () => {
    const registry = createContextLoaderRegistry({
      custom: async (source) => {
        const customSource = source as { value?: string };
        return `custom:${String(customSource.value ?? "")}`;
      },
    });

    const content = await composeContext(
      [
        { type: "custom", value: "one" },
        { type: "custom", value: "two" },
      ],
      registry,
      " | ",
    );

    expect(content).toBe("custom:one | custom:two");
  });

  it("loads file slices by line range", async () => {
    const filePath = join(tmpDir, "snippet.txt");
    writeFileSync(filePath, "a\nb\nc\nd\n", "utf-8");

    const content = await loadContextSource({
      type: "file",
      filePath,
      lines: "2-3",
    });

    expect(content).toBe("b\nc");
  });
});
