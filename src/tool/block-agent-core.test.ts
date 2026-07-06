import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { registerBlockAgentCoreTool } from "./block-agent-core.ts";
import { handleSendMessage } from "./actions/send-task.ts";
import { handleReadEvents } from "./actions/read-events.ts";
import { handleCreateSession } from "./actions/create-session.ts";
import { handleUpdateSession } from "./actions/update-session.ts";
import { handleListContextMounts, handleMountContext, handleUnmountContext } from "./actions/context-mounts.ts";
import { readJsonl } from "../utils/jsonl.ts";
import { TaskScheduler, resetDefaultTaskSchedulerForTests } from "../session/task-scheduler.ts";

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

async function waitForSendFinish(sessionId: string, turnId: number): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const eventsResult = await handleReadEvents({ sessionId, turnId }, createCtx());
    if (eventsResult.content[0]!.text.includes("send_finished")) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`send did not finish in time: ${sessionId}/${turnId}`);
}

function extractTurnId(response: any): number {
  const parsed = JSON.parse(response.content[0]!.text);
  return parsed.send.turnId;
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
    expect(readFileSync(join(sessionDir, "system-config.json"), "utf-8")).toContain("\"sdkMode\": \"host-inherit\"");
    expect(readFileSync(join(sessionDir, "messages.jsonl"), "utf-8")).toBe("");
    expect(readFileSync(join(sessionDir, "events.jsonl"), "utf-8")).toContain("session_initialized");
  });

  it("updates a session config while keeping mounts in event state", async () => {
    const promptPathA = join(tmpDir, "prompt-update-a.md");
    const promptPathB = join(tmpDir, "prompt-update-b.md");
    const notePath = join(tmpDir, "note-update.md");
    writeFileSync(promptPathA, "Prompt A", "utf-8");
    writeFileSync(promptPathB, "Prompt B", "utf-8");
    writeFileSync(notePath, "Mounted note", "utf-8");

    await handleCreateSession({
      sessionId: "session-update",
      systemPromptFilePaths: [promptPathA],
      sdkMode: "host-inherit",
      modelSelection: { strategy: "specific", provider: "deepseek", modelId: "deepseek-v4-flash" } as any,
      tools: { names: ["read", "ls"] },
    }, createCtx());

    await handleMountContext({
      sessionId: "session-update",
      sources: [{ type: "file", filePath: notePath }],
    } as any, createCtx());

    const result = await handleUpdateSession({
      sessionId: "session-update",
      systemPromptFilePaths: [promptPathA, promptPathB],
      modelSelection: { strategy: "specific", provider: "deepseek", modelId: "deepseek-v4-pro" } as any,
      tools: { names: ["grep"] },
    }, createCtx());

    expect(result.content[0]!.text).toContain("\"modelId\": \"deepseek-v4-pro\"");
    expect(result.content[0]!.text).toContain("\"grep\"");

    const sessionDir = join(tmpDir, ".block-agent-core", "sessions", "session-update");
    const config = JSON.parse(readFileSync(join(sessionDir, "system-config.json"), "utf-8"));
    expect(config.systemPromptFilePaths).toEqual([promptPathA, promptPathB]);
    expect(config.tools).toEqual({ names: ["grep"] });

    const mountsResult = JSON.parse((await handleListContextMounts({
      sessionId: "session-update",
    }, createCtx())).content[0]!.text);
    expect(mountsResult.mounts).toHaveLength(1);
  });

  it("runs a send with system prompts, merged tool messages, file calls, and events", async () => {
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
    const sendResponse = await handleSendMessage({
      sessionId: "session-b",
      inputText: "Investigate the issue",
    }, createCtx(), {
      scheduler,
      composeContextText: async (sources) => {
        const fileSource = sources[0] as { filePath: string };
        return readFileSync(fileSource.filePath, "utf-8");
      },
      runWithSdk: async (options) => ({
        runId: options.runId,
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
    const send1TurnId = extractTurnId(sendResponse);

    await waitForSendFinish("session-b", send1TurnId);

    const eventsResult = await handleReadEvents({ sessionId: "session-b", turnId: send1TurnId }, createCtx());
    expect(eventsResult.content[0]!.text).toContain("send_finished");

    const sessionDir = join(tmpDir, ".block-agent-core", "sessions", "session-b");
    const messages = await readJsonl<{ kind: string; text?: string; toolName?: string; filePath?: string }>(join(sessionDir, "messages.jsonl"));
    expect(messages.map(item => item.kind)).toEqual(["input", "reasoning", "tool_call", "reply"]);
    const systemConfig = JSON.parse(readFileSync(join(sessionDir, "system-config.json"), "utf-8"));
    expect(systemConfig.systemPromptText).toContain("You are a coding session.");
    expect(systemConfig.systemPromptFilePaths).toEqual([promptPath]);

    const toolCallMsg = messages.find(m => m.kind === "tool_call");
    expect(toolCallMsg!.toolName).toBe("read");
  });

  it("supports seq-range unmount and remount", async () => {
    const promptPath = join(tmpDir, "prompt-range.md");
    writeFileSync(promptPath, "Prompt", "utf-8");

    await handleCreateSession({
      sessionId: "session-range",
      systemPromptFilePaths: [promptPath],
      sdkMode: "host-inherit",
      tools: { names: ["read"] },
    }, createCtx());

    const { appendSessionMessage, appendSessionEvent } = await import("../session/store.ts");
    await appendSessionMessage(tmpDir, "session-range", { id: 1, kind: "input", text: "A" });
    await appendSessionMessage(tmpDir, "session-range", { id: 2, kind: "reply", text: "B", parentId: 1 });
    await appendSessionMessage(tmpDir, "session-range", { id: 3, kind: "reply", text: "C", parentId: 2 });
    await appendSessionMessage(tmpDir, "session-range", { id: 4, kind: "reply", text: "D", parentId: 3 });
    await appendSessionEvent(tmpDir, "session-range", {
      type: "send_finished",
      payload: { activeMessageIdRanges: [[1, 4]] },
    });

    const unmountResult = await handleUnmountContext({
      sessionId: "session-range",
      idRanges: [[3, 4]],
    }, createCtx());
    expect(unmountResult.content[0]!.text).toContain("Updated active context");

    const afterUnmount = JSON.parse((await handleListContextMounts({ sessionId: "session-range" }, createCtx())).content[0]!.text);
    expect(afterUnmount.activeMessageIds).toEqual([1, 2]);

    await handleMountContext({
      sessionId: "session-range",
      idRanges: [[3, 4]],
    }, createCtx());

    const afterRemount = JSON.parse((await handleListContextMounts({ sessionId: "session-range" }, createCtx())).content[0]!.text);
    expect(afterRemount.activeMessageIds).toEqual([1, 2, 3, 4]);
  });

  it("rolls back provisional messages after a failed send retry", async () => {
    const promptPath = join(tmpDir, "prompt-fail-retry.md");
    writeFileSync(promptPath, "Prompt", "utf-8");

    await handleCreateSession({
      sessionId: "session-fail-retry",
      systemPromptFilePaths: [promptPath],
      sdkMode: "host-inherit",
      tools: { names: ["read"] },
    }, createCtx());

    const scheduler = new TaskScheduler(8);
    const failingDeps = {
      scheduler,
      composeContextText: async () => "",
      runWithSdk: async () => {
        throw new Error("sdk bootstrap failed");
      },
    };

    const send1Response = await handleSendMessage({
      sessionId: "session-fail-retry",
      inputText: "first try",
    }, createCtx(), failingDeps);
    const send1TurnId = extractTurnId(send1Response);
    await waitForSendFinish("session-fail-retry", send1TurnId);

    const sessionDir = join(tmpDir, ".block-agent-core", "sessions", "session-fail-retry");
    const messagesAfterFirstFail = await readJsonl<{ id: number; kind: string }>(join(sessionDir, "messages.jsonl"));
    expect(messagesAfterFirstFail).toEqual([]);

    const send2Response = await handleSendMessage({
      sessionId: "session-fail-retry",
      inputText: "second try",
    }, createCtx(), failingDeps);
    const send2TurnId = extractTurnId(send2Response);
    await waitForSendFinish("session-fail-retry", send2TurnId);

    const messagesAfterSecondFail = await readJsonl<{ id: number; kind: string }>(join(sessionDir, "messages.jsonl"));
    expect(messagesAfterSecondFail).toEqual([]);

    const mountsState = JSON.parse((await handleListContextMounts({
      sessionId: "session-fail-retry",
    }, createCtx())).content[0]!.text);
    expect(mountsState.activeMessageIds).toEqual([]);
  });
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});
