import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { registerBlockAgentCoreTool } from "./block-agent-core.ts";
import { handleSendTask } from "./actions/send-task.ts";
import { handleGetTask } from "./actions/send-task.ts";
import { handleReadEvents } from "./actions/read-events.ts";
import { handleCreateSession } from "./actions/create-session.ts";
import { handleMountContext } from "./actions/context-mounts.ts";
import { readJsonl } from "../utils/jsonl.ts";
import { TaskScheduler, resetDefaultTaskSchedulerForTests } from "../core/task-scheduler.ts";

const tmpDir = mkdtempSync(join(process.cwd(), ".tmp-block-agent-core-test-"));

function createCtx() {
  return {
    cwd: tmpDir,
    modelRegistry: {
      getAll: () => [{ provider: "deepseek", id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", reasoning: true, input: ["text"] }],
      getAvailable: () => [{ provider: "deepseek", id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", reasoning: true, input: ["text"] }],
      find: () => ({ provider: "deepseek", id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", reasoning: true, input: ["text"] }),
    },
  } as any;
}

beforeEach(() => {
  resetDefaultTaskSchedulerForTests();
});

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

    const result = await tools[0]!.execute("call", { action: "run_subagent" }, undefined, undefined, createCtx());
    expect(result.content[0]!.text).toContain("Unknown action");
  });
});

describe("session-first actions", () => {
  it("creates a session and core files", async () => {
    const promptPath = join(tmpDir, "prompt.md");
    writeFileSync(promptPath, "System prompt", "utf-8");
    const result = await handleCreateSession({
      sessionId: "session-a",
      systemPromptFilePaths: [promptPath],
      sdkMode: "host-inherit",
      tools: { names: ["read"] },
    }, createCtx());

    expect(result.content[0]!.text).toContain("Created session");
    const sessionDir = join(tmpDir, ".block-agent-core", "sessions", "session-a");
    expect(readFileSync(join(sessionDir, "system-prompts.json"), "utf-8")).toContain("\"sdkMode\": \"host-inherit\"");
    expect(readFileSync(join(sessionDir, "messages.jsonl"), "utf-8")).toBe("");
    expect(readFileSync(join(sessionDir, "tool-calls.jsonl"), "utf-8")).toBe("");
    expect(readFileSync(join(sessionDir, "file-calls.jsonl"), "utf-8")).toBe("");
  });

  it("mounts context and runs a task with archived reply, tool calls, file calls, and events", async () => {
    const promptPath = join(tmpDir, "task-prompt.md");
    const notePath = join(tmpDir, "note.md");
    writeFileSync(promptPath, "You are a coding session.", "utf-8");
    writeFileSync(notePath, "Mounted context note", "utf-8");

    await handleCreateSession({
      sessionId: "session-b",
      systemPromptFilePaths: [promptPath],
      sdkMode: "host-inherit",
      tools: { names: ["read", "ls"] },
    }, createCtx());

    await handleMountContext({
      sessionId: "session-b",
      sources: [{ type: "file", filePath: notePath }],
    } as any, createCtx());

    const scheduler = new TaskScheduler(8);
    await handleSendTask({
      sessionId: "session-b",
      taskId: "task-1",
      inputText: "Investigate the issue",
    }, createCtx(), {
      scheduler,
      composeContextText: async (sources) => {
        const fileSource = sources[0] as { filePath: string };
        return readFileSync(fileSource.filePath, "utf-8");
      },
      runWithSdk: async (options) => ({
        runId: options.turnIdentity.runId,
        turnId: `${options.turnIdentity.runId}:${options.turnIdentity.keyParts.join(":")}`,
        model: {
          provider: "deepseek",
          modelId: "deepseek-v4-flash",
          displayName: "DeepSeek V4 Flash",
          reasoning: true,
          input: ["text"],
          available: true,
        },
        tools: ["read", "ls"],
        prompt: `${options.systemPrompt}\n${options.context}\n${options.inputText}`,
        reasoningText: "thinking",
        replyText: "done",
        toolCalls: [{
          id: "call-1",
          messageId: "",
          toolName: "read",
          params: { path: notePath },
          result: { ok: true },
          metadata: { isError: false },
        }],
      }),
    });

    await new Promise(resolve => setTimeout(resolve, 20));

    const taskResult = await handleGetTask({ sessionId: "session-b", taskId: "task-1" }, createCtx());
    expect(taskResult.content[0]!.text).toContain("\"status\": \"completed\"");

    const eventsResult = await handleReadEvents({ sessionId: "session-b" }, createCtx());
    expect(eventsResult.content[0]!.text).toContain("task_completed");

    const sessionDir = join(tmpDir, ".block-agent-core", "sessions", "session-b");
    const messages = await readJsonl<{ kind: string }>(join(sessionDir, "messages.jsonl"));
    expect(messages.map(item => item.kind)).toEqual(["reasoning", "tool_call", "file_call", "reply"]);
    const toolCalls = await readJsonl<{ toolName: string }>(join(sessionDir, "tool-calls.jsonl"));
    expect(toolCalls[0]!.toolName).toBe("read");
    const fileCalls = await readJsonl<{ filePath: string }>(join(sessionDir, "file-calls.jsonl"));
    expect(fileCalls.some(item => item.filePath === notePath)).toBe(true);
  });
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});
