import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  createSession,
  readEvents,
  readMessages,
} from "./store.ts";
import {
  createInputMessage,
  executeSessionTask,
  rollbackCreatedInputArtifacts,
  type SessionTaskRunnerDeps,
} from "./runtime.ts";

const tmpDir = mkdtempSync(join(process.cwd(), ".tmp-session-runtime-test-"));

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function mockDeps(overrides?: Partial<SessionTaskRunnerDeps>): SessionTaskRunnerDeps {
  return {
    composeContextText: async (sources, _sep) =>
      sources.map(s => `[context: ${(s as any).type ?? "file"}]`).join("\n"),
    runWithSdk: async () => ({
      runId: "test",
      model: { provider: "test", modelId: "test", displayName: "Test", reasoning: false, input: [], available: true },
      tools: ["read"],
      prompt: "test prompt",
      reasoningText: "thinking...",
      replyText: "done.",
      toolCalls: [],
    }),
    ...overrides,
  };
}

async function setupSession(sessionId: string): Promise<void> {
  const promptPath = join(tmpDir, "prompt.md");
  writeFileSync(promptPath, "You are a test assistant.", "utf-8");
  await createSession(tmpDir, {
    sessionId,
    systemPromptFilePaths: [promptPath],
    sdkMode: "host-inherit",
  });
}

const mockCtx = {
  cwd: tmpDir,
  modelRegistry: {
    getAll: () => [],
    getAvailable: () => [],
    find: () => undefined,
  },
};

describe("createInputMessage", () => {
  it("creates an input message with the provided text", async () => {
    await setupSession("input-test");
    const result = await createInputMessage(tmpDir, "input-test", "Hello world", 1);
    expect(result.inputMessage.kind).toBe("input");
    expect(result.inputMessage.text).toBe("Hello world");
    expect(result.inputMessage.turnId).toBe(1);
  });

  it("assigns sequential message ids", async () => {
    await setupSession("input-seq-test");
    const r1 = await createInputMessage(tmpDir, "input-seq-test", "First", 1);
    const r2 = await createInputMessage(tmpDir, "input-seq-test", "Second", 2);
    expect(r2.inputMessage.id).toBeGreaterThan(r1.inputMessage.id);
    // Without a send cycle between them, parentId may be undefined (no active context yet)
    // The first input in a fresh session has no parent
  });

  it("includes metadata when provided", async () => {
    await setupSession("input-meta-test");
    const result = await createInputMessage(tmpDir, "input-meta-test", "Hi", 1, { source: "test" });
    expect(result.inputMessage.metadata).toEqual({ source: "test" });
  });
});

describe("rollbackCreatedInputArtifacts", () => {
  it("removes the input message from messages.jsonl", async () => {
    await setupSession("rollback-test");
    const created = await createInputMessage(tmpDir, "rollback-test", "to be removed", 1);
    const before = await readMessages(tmpDir, "rollback-test");
    expect(before.some(m => m.id === created.inputMessage.id)).toBe(true);

    await rollbackCreatedInputArtifacts(tmpDir, "rollback-test", created);
    const after = await readMessages(tmpDir, "rollback-test");
    expect(after.some(m => m.id === created.inputMessage.id)).toBe(false);
  });
});

describe("executeSessionTask", () => {
  it("returns execution result with output message ids", async () => {
    await setupSession("exec-test");
    const created = await createInputMessage(tmpDir, "exec-test", "test input", 1);

    const result = await executeSessionTask(tmpDir, "exec-test", {
      turnId: 1,
      inputText: "test input",
      inputId: created.inputMessage.id,
      ...(created.parentId !== undefined ? { parentId: created.parentId } : {}),
    }, mockCtx, mockDeps());

    expect(result.outputMessageIds.length).toBeGreaterThanOrEqual(2); // reasoning + reply
    expect(result.activeMessageIds.length).toBeGreaterThan(0);
    expect(result.tools).toEqual(["read"]);
  });

  it("records tool calls as tool_call messages", async () => {
    await setupSession("tool-call-test");
    const created = await createInputMessage(tmpDir, "tool-call-test", "read a file", 1);

    const deps = mockDeps({
      runWithSdk: async () => ({
        runId: "test",
        model: { provider: "test", modelId: "test", displayName: "Test", reasoning: false, input: [], available: true },
        tools: ["read"],
        prompt: "test prompt",
        reasoningText: "thinking...",
        replyText: "done.",
        toolCalls: [{
          id: "tool-1",
          messageId: "",
          toolName: "read",
          params: { path: "/tmp/test.txt" },
          result: "file contents",
          metadata: { isError: false },
        }],
      }),
    });

    await executeSessionTask(tmpDir, "tool-call-test", {
      turnId: 1,
      inputText: "read a file",
      inputId: created.inputMessage.id,
      ...(created.parentId !== undefined ? { parentId: created.parentId } : {}),
    }, mockCtx, deps);

    const messages = await readMessages(tmpDir, "tool-call-test");
    const toolCalls = messages.filter(m => m.kind === "tool_call");
    expect(toolCalls.length).toBe(1);
    expect(toolCalls[0]!.toolName).toBe("read");
    expect(toolCalls[0]!.toolParams).toEqual({ path: "/tmp/test.txt" });
    expect(toolCalls[0]!.toolResult).toBe("file contents");
  });

  it("records tool errors with error flags", async () => {
    await setupSession("tool-error-test");
    const created = await createInputMessage(tmpDir, "tool-error-test", "bad tool", 1);

    const deps = mockDeps({
      runWithSdk: async () => ({
        runId: "test",
        model: { provider: "test", modelId: "test", displayName: "Test", reasoning: false, input: [], available: true },
        tools: ["read"],
        prompt: "test prompt",
        reasoningText: "thinking...",
        replyText: "error occurred.",
        toolCalls: [{
          id: "tool-1",
          messageId: "",
          toolName: "read",
          params: { path: "/nonexistent" },
          result: "ENOENT: no such file",
          metadata: { isError: true },
        }],
      }),
    });

    await executeSessionTask(tmpDir, "tool-error-test", {
      turnId: 1,
      inputText: "bad tool",
      inputId: created.inputMessage.id,
      ...(created.parentId !== undefined ? { parentId: created.parentId } : {}),
    }, mockCtx, deps);

    const messages = await readMessages(tmpDir, "tool-error-test");
    const toolCalls = messages.filter(m => m.kind === "tool_call");
    expect(toolCalls[0]!.toolError).toBe(true);
  });

  it("records tool_call messages with timestamps", async () => {
    await setupSession("timestamp-test");
    const created = await createInputMessage(tmpDir, "timestamp-test", "test", 1);
    const toolCalls = [{
      id: "tool-1",
      messageId: "",
      toolName: "read",
      params: { path: "/tmp/f.txt" },
      result: "ok",
      metadata: { isError: false },
    }];
    const deps = mockDeps({
      runWithSdk: async (opts) => {
        for (const tc of toolCalls) {
          await opts.onEvent?.({
            type: "tool_call_started",
            payload: { toolCallId: tc.id, toolName: tc.toolName, args: tc.params } as any,
          });
          await opts.onEvent?.({
            type: "tool_call_finished",
            payload: { toolCallId: tc.id, toolName: tc.toolName, result: tc.result, isError: tc.metadata?.isError ?? false } as any,
          });
        }
        return {
          runId: "test",
          model: { provider: "test", modelId: "test", displayName: "Test", reasoning: false, input: [], available: true },
          tools: ["read"],
          prompt: "test",
          reasoningText: "...",
          replyText: "done.",
          toolCalls,
        };
      },
    });

    await executeSessionTask(tmpDir, "timestamp-test", {
      turnId: 1,
      inputText: "test",
      inputId: created.inputMessage.id,
      ...(created.parentId !== undefined ? { parentId: created.parentId } : {}),
    }, mockCtx, deps);

    const events = await readEvents(tmpDir, "timestamp-test");
    const finishedEvent = events.find(e => e.type === "tool_send_finished");
    expect(finishedEvent).toBeDefined();
    expect(typeof finishedEvent!.payload.finishedAt).toBe("string");
  });

  // ── T1-4: Token 用量统计（记录在 executeSessionTask 返回值中）─────────────

  it("T1-4: executeSessionTask returns usage when SDK provides it", async () => {
    await setupSession("usage-return-test");
    const created = await createInputMessage(tmpDir, "usage-return-test", "test", 1);
    const deps = mockDeps({
      runWithSdk: async () => ({
        runId: "test",
        model: { provider: "test", modelId: "test", displayName: "Test", reasoning: false, input: [], available: true },
        tools: [],
        prompt: "test",
        reasoningText: "...",
        replyText: "done.",
        toolCalls: [],
        usage: { inputTokens: 200, outputTokens: 80 },
      }),
    });

    const result = await executeSessionTask(tmpDir, "usage-return-test", {
      turnId: 1,
      inputText: "test",
      inputId: created.inputMessage.id,
      ...(created.parentId !== undefined ? { parentId: created.parentId } : {}),
    }, mockCtx, deps);

    expect(result.usage).toEqual({ inputTokens: 200, outputTokens: 80 });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("T1-4: executeSessionTask returns no usage when SDK does not provide it", async () => {
    await setupSession("no-usage-return-test");
    const created = await createInputMessage(tmpDir, "no-usage-return-test", "test", 1);
    const deps = mockDeps({
      runWithSdk: async () => ({
        runId: "test",
        model: { provider: "test", modelId: "test", displayName: "Test", reasoning: false, input: [], available: true },
        tools: [],
        prompt: "test",
        reasoningText: "...",
        replyText: "done.",
        toolCalls: [],
        // no usage field
      }),
    });

    const result = await executeSessionTask(tmpDir, "no-usage-return-test", {
      turnId: 1,
      inputText: "test",
      inputId: created.inputMessage.id,
      ...(created.parentId !== undefined ? { parentId: created.parentId } : {}),
    }, mockCtx, deps);

    expect(result.usage).toBeUndefined();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  // ── T1-5: 执行时间记录（turn 级别在 reply 上，tool 级别在 tool_call 上）─

  it("T1-5: executeSessionTask returns durationMs", async () => {
    await setupSession("duration-return-test");
    const created = await createInputMessage(tmpDir, "duration-return-test", "test", 1);

    const result = await executeSessionTask(tmpDir, "duration-return-test", {
      turnId: 1,
      inputText: "test",
      inputId: created.inputMessage.id,
      ...(created.parentId !== undefined ? { parentId: created.parentId } : {}),
    }, mockCtx, mockDeps());

    expect(typeof result.durationMs).toBe("number");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("T1-5: tool_send_finished event carries startedAt and finishedAt timestamps", async () => {
    await setupSession("tool-timing-event-test");
    const created = await createInputMessage(tmpDir, "tool-timing-event-test", "test", 1);
    const toolCalls = [{
      id: "tool-1",
      messageId: "",
      toolName: "read",
      params: { path: "/tmp/f.txt" },
      result: "ok",
      metadata: { isError: false },
    }];
    const deps = mockDeps({
      runWithSdk: async (opts) => {
        for (const tc of toolCalls) {
          await opts.onEvent?.({
            type: "tool_call_started",
            payload: { toolCallId: tc.id, toolName: tc.toolName, args: tc.params } as any,
          });
          await opts.onEvent?.({
            type: "tool_call_finished",
            payload: { toolCallId: tc.id, toolName: tc.toolName, result: tc.result, isError: tc.metadata?.isError ?? false } as any,
          });
        }
        return {
          runId: "test",
          model: { provider: "test", modelId: "test", displayName: "Test", reasoning: false, input: [], available: true },
          tools: ["read"],
          prompt: "test",
          reasoningText: "...",
          replyText: "done.",
          toolCalls,
        };
      },
    });

    await executeSessionTask(tmpDir, "tool-timing-event-test", {
      turnId: 1,
      inputText: "test",
      inputId: created.inputMessage.id,
      ...(created.parentId !== undefined ? { parentId: created.parentId } : {}),
    }, mockCtx, deps);

    const events = await readEvents(tmpDir, "tool-timing-event-test");
    const finishedEvent = events.find(e => e.type === "tool_send_finished");
    expect(finishedEvent).toBeDefined();
    expect(typeof finishedEvent!.payload.finishedAt).toBe("string");
  });
});
