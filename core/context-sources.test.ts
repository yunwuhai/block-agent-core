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

  it("filters JSONL records by custom id key", async () => {
    const jsonlPath = join(tmpDir, "events.jsonl");
    await appendJsonl(jsonlPath, { key: "a", payload: { text: "first" } });
    await appendJsonl(jsonlPath, { key: "b", payload: { text: "second" } });

    const content = await loadContextSource({
      type: "jsonl-fields",
      filePath: jsonlPath,
      fieldOrder: ["payload.text"],
      idKey: "key",
      recordIds: ["b"],
    });

    expect(content).toBe("second");
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
