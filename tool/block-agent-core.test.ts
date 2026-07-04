import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { registerBlockAgentCoreTool } from "./block-agent-core.ts";
import { handleArchiveResult } from "./actions/archive-result.ts";
import { handleListModels } from "./actions/list-models.ts";
import { handleLoadContext } from "./actions/load-context.ts";
import { handleRunSubagent } from "./actions/run-subagent.ts";
import { appendJsonl } from "../utils/jsonl.ts";

const tmpDir = mkdtempSync(join(process.cwd(), ".tmp-block-agent-core-test-"));

describe("block_agent_core tool", () => {
  it("registers block_agent_core instead of dialogue_memory", () => {
    const tools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    registerBlockAgentCoreTool({
      registerTool(tool: any) {
        tools.push(tool);
      },
    } as any);

    expect(tools).toHaveLength(1);
    expect(tools[0]!.name).toBe("block_agent_core");
  });

  it("rejects old action names", async () => {
    const tools: Array<{ execute: (...args: any[]) => Promise<any> }> = [];
    registerBlockAgentCoreTool({
      registerTool(tool: any) {
        tools.push(tool);
      },
    } as any);

    const result = await tools[0]!.execute("call", { action: "query" }, undefined, undefined, {});
    expect(result.content[0]!.text).toContain("Unknown action");
  });
});

describe("block_agent_core actions", () => {
  it("load_context composes JSONL field sources", async () => {
    const filePath = join(tmpDir, "messages.jsonl");
    await appendJsonl(filePath, { id: "m1", body: "hello" });
    await appendJsonl(filePath, { id: "m2", body: "world" });

    const result = await handleLoadContext({
      sources: [{
        type: "jsonl-fields",
        filePath,
        fieldOrder: ["body"],
      }],
    } as any, {} as any);

    expect(result.content[0]!.text).toBe("hello\n\nworld");
  });

  it("list_models returns all and available arrays", async () => {
    const result = await handleListModels({
      modelRegistry: {
        getAll: () => [{ provider: "deepseek", id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", reasoning: true, input: ["text"] }],
        getAvailable: () => [{ provider: "deepseek", id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", reasoning: true, input: ["text"] }],
      },
    } as any);

    expect(result.content[0]!.text).toContain("\"all\"");
    expect(result.content[0]!.text).toContain("\"available\"");
  });

  it("archive_result uses the default archive shape", async () => {
    const archiveRootDir = join(tmpDir, "archive-result");
    const result = await handleArchiveResult({
      archiveRootDir,
      messages: [{ id: "m1", kind: "reply", text: "done", sequence: 1 }],
    } as any, { cwd: tmpDir } as any);

    expect(result.content[0]!.text).toContain("Archived result");
    expect(readFileSync(join(archiveRootDir, "messages.jsonl"), "utf-8")).toContain("\"kind\":\"reply\"");
  });

  it("run_subagent passes model, tools, turn id, and default archive dir to the SDK layer", async () => {
    let captured: any;
    const result = await handleRunSubagent({
      inputText: "Implement feature",
      runId: "run-1",
      keyParts: ["step-1"],
      tools: { names: ["read", "write"] },
      modelSelection: { strategy: "specific", provider: "deepseek", modelId: "deepseek-v4-flash" } as any,
    }, {
      cwd: "/workspace/project",
      modelRegistry: { marker: true },
      model: { provider: "deepseek", id: "deepseek-v4-flash" },
    } as any, {
      composeContextText: async () => "",
      defaultArchiveRootDir: (cwd, runId) => `${cwd}/.block-agent-core/runs/${runId}`,
      runWithSdk: async (options) => {
        captured = options;
        return {
          runId: options.turnIdentity.runId,
          turnId: "turn:run-1:step-1",
          model: {
            provider: "deepseek",
            modelId: "deepseek-v4-flash",
            displayName: "DeepSeek V4 Flash",
            reasoning: true,
            input: ["text"],
            available: true,
          },
          tools: ["read", "write"],
          prompt: "prompt",
          reasoningText: "thinking",
          replyText: "done",
          toolCalls: [],
        };
      },
    });

    expect(captured.turnIdentity.runId).toBe("run-1");
    expect(captured.turnIdentity.keyParts).toEqual(["step-1"]);
    expect(captured.tools).toEqual({ names: ["read", "write"] });
    expect(captured.modelSelection).toEqual({ strategy: "specific", provider: "deepseek", modelId: "deepseek-v4-flash" });
    expect(captured.archiveRootDir).toBe("/workspace/project/.block-agent-core/runs/run-1");
    expect(result.content[0]!.text).toBe("done");
  });
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});
