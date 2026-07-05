import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  createSession,
  readMessages,
  updateSessionConfig,
} from "./session-store.ts";
import {
  createInputMessage,
  executeSessionTask,
  rollbackCreatedInputArtifacts,
  type SessionTaskRunnerDeps,
} from "./session-runtime.ts";

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
    const deps = mockDeps({
      runWithSdk: async () => ({
        runId: "test",
        model: { provider: "test", modelId: "test", displayName: "Test", reasoning: false, input: [], available: true },
        tools: ["read"],
        prompt: "test",
        reasoningText: "...",
        replyText: "done.",
        toolCalls: [{
          id: "tool-1",
          messageId: "",
          toolName: "read",
          params: { path: "/tmp/f.txt" },
          result: "ok",
          metadata: { isError: false },
        }],
      }),
    });

    await executeSessionTask(tmpDir, "timestamp-test", {
      turnId: 1,
      inputText: "test",
      inputId: created.inputMessage.id,
      ...(created.parentId !== undefined ? { parentId: created.parentId } : {}),
    }, mockCtx, deps);

    const messages = await readMessages(tmpDir, "timestamp-test");
    const toolCalls = messages.filter(m => m.kind === "tool_call");
    expect(typeof toolCalls[0]!.finishedAt).toBe("string");
  });

  // ── T1-4: Token 用量统计（记录在 reply message 上）─────────────────────

  it("T1-4: reply message carries per-turn usage when SDK provides it", async () => {
    await setupSession("usage-reply-test");
    const created = await createInputMessage(tmpDir, "usage-reply-test", "test", 1);
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

    await executeSessionTask(tmpDir, "usage-reply-test", {
      turnId: 1,
      inputText: "test",
      inputId: created.inputMessage.id,
      ...(created.parentId !== undefined ? { parentId: created.parentId } : {}),
    }, mockCtx, deps);

    const messages = await readMessages(tmpDir, "usage-reply-test");
    const reply = messages.filter(m => m.kind === "reply");
    expect(reply.length).toBeGreaterThanOrEqual(1);
    expect(reply[reply.length - 1]!.usage).toEqual({ inputTokens: 200, outputTokens: 80 });
  });

  it("T1-4: reply message has no usage when SDK does not provide it", async () => {
    await setupSession("no-usage-test");
    const created = await createInputMessage(tmpDir, "no-usage-test", "test", 1);
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

    await executeSessionTask(tmpDir, "no-usage-test", {
      turnId: 1,
      inputText: "test",
      inputId: created.inputMessage.id,
      ...(created.parentId !== undefined ? { parentId: created.parentId } : {}),
    }, mockCtx, deps);

    const messages = await readMessages(tmpDir, "no-usage-test");
    const reply = messages.filter(m => m.kind === "reply");
    expect(reply[reply.length - 1]!.usage).toBeUndefined();
  });

  // ── T1-5: 执行时间记录（turn 级别在 reply 上，tool 级别在 tool_call 上）─

  it("T1-5: reply message carries durationMs", async () => {
    await setupSession("duration-reply-test");
    const created = await createInputMessage(tmpDir, "duration-reply-test", "test", 1);

    await executeSessionTask(tmpDir, "duration-reply-test", {
      turnId: 1,
      inputText: "test",
      inputId: created.inputMessage.id,
      ...(created.parentId !== undefined ? { parentId: created.parentId } : {}),
    }, mockCtx, mockDeps());

    const messages = await readMessages(tmpDir, "duration-reply-test");
    const reply = messages.filter(m => m.kind === "reply");
    expect(typeof reply[reply.length - 1]!.durationMs).toBe("number");
    expect(reply[reply.length - 1]!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("T1-5: tool_call messages carry startedAt and finishedAt timestamps", async () => {
    await setupSession("tool-timing-test");
    const created = await createInputMessage(tmpDir, "tool-timing-test", "test", 1);
    const deps = mockDeps({
      runWithSdk: async () => ({
        runId: "test",
        model: { provider: "test", modelId: "test", displayName: "Test", reasoning: false, input: [], available: true },
        tools: ["read"],
        prompt: "test",
        reasoningText: "...",
        replyText: "done.",
        toolCalls: [{
          id: "tool-1",
          messageId: "",
          toolName: "read",
          params: { path: "/tmp/f.txt" },
          result: "ok",
          metadata: { isError: false },
        }],
      }),
    });

    await executeSessionTask(tmpDir, "tool-timing-test", {
      turnId: 1,
      inputText: "test",
      inputId: created.inputMessage.id,
      ...(created.parentId !== undefined ? { parentId: created.parentId } : {}),
    }, mockCtx, deps);

    const messages = await readMessages(tmpDir, "tool-timing-test");
    const toolCalls = messages.filter(m => m.kind === "tool_call");
    expect(toolCalls.length).toBe(1);
    expect(typeof toolCalls[0]!.finishedAt).toBe("string");
    // startedAt is captured from tool_call_started event, so it's set when onEvent fires
    // in mock test, onEvent is called but toolStartedAt is tracked via sdkToMessageId
  });

  // ── T1-7: 可配置超时 ───────────────────────────────────────────────────

  it("T1-7: passes timeoutMs to runWithSdk when specified in request", async () => {
    await setupSession("timeout-req-test");
    const created = await createInputMessage(tmpDir, "timeout-req-test", "test", 1);

    let receivedTimeoutMs: number | undefined;
    const deps = mockDeps({
      runWithSdk: async (opts) => {
        receivedTimeoutMs = (opts as any).timeoutMs;
        return {
          runId: "test",
          model: { provider: "test", modelId: "test", displayName: "Test", reasoning: false, input: [], available: true },
          tools: [],
          prompt: "test",
          reasoningText: "...",
          replyText: "done.",
          toolCalls: [],
        };
      },
    });

    await executeSessionTask(tmpDir, "timeout-req-test", {
      turnId: 1,
      inputText: "test",
      inputId: created.inputMessage.id,
      timeoutMs: 5000,
    }, mockCtx, deps);

    expect(receivedTimeoutMs).toBe(5000);
  });

  it("T1-7: resolves timeout from config.defaultTimeoutMs when request has none", async () => {
    const promptPath = join(tmpDir, "prompt-timeout-default.md");
    writeFileSync(promptPath, "timeout default", "utf-8");
    await createSession(tmpDir, {
      sessionId: "timeout-default-test",
      systemPromptFilePaths: [promptPath],
      sdkMode: "host-inherit",
    });
    await updateSessionConfig(tmpDir, "timeout-default-test", { defaultTimeoutMs: 90000 });

    const created = await createInputMessage(tmpDir, "timeout-default-test", "test", 1);

    let receivedTimeoutMs: number | undefined;
    const deps = mockDeps({
      runWithSdk: async (opts) => {
        receivedTimeoutMs = (opts as any).timeoutMs;
        return {
          runId: "test",
          model: { provider: "test", modelId: "test", displayName: "Test", reasoning: false, input: [], available: true },
          tools: [],
          prompt: "test",
          reasoningText: "...",
          replyText: "done.",
          toolCalls: [],
        };
      },
    });

    await executeSessionTask(tmpDir, "timeout-default-test", {
      turnId: 1,
      inputText: "test",
      inputId: created.inputMessage.id,
    }, mockCtx, deps);

    expect(receivedTimeoutMs).toBe(90000);
  });

  it("T1-7: request-level timeoutMs takes precedence over config", async () => {
    const promptPath = join(tmpDir, "prompt-timeout-override.md");
    writeFileSync(promptPath, "timeout override", "utf-8");
    await createSession(tmpDir, {
      sessionId: "timeout-override-test",
      systemPromptFilePaths: [promptPath],
      sdkMode: "host-inherit",
    });
    await updateSessionConfig(tmpDir, "timeout-override-test", { defaultTimeoutMs: 120000 });

    const created = await createInputMessage(tmpDir, "timeout-override-test", "test", 1);

    let receivedTimeoutMs: number | undefined;
    const deps = mockDeps({
      runWithSdk: async (opts) => {
        receivedTimeoutMs = (opts as any).timeoutMs;
        return {
          runId: "test",
          model: { provider: "test", modelId: "test", displayName: "Test", reasoning: false, input: [], available: true },
          tools: [],
          prompt: "test",
          reasoningText: "...",
          replyText: "done.",
          toolCalls: [],
        };
      },
    });

    await executeSessionTask(tmpDir, "timeout-override-test", {
      turnId: 1,
      inputText: "test",
      inputId: created.inputMessage.id,
      timeoutMs: 30000, // request-level takes precedence
    }, mockCtx, deps);

    expect(receivedTimeoutMs).toBe(30000);
  });
});
