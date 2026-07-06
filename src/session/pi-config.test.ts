import { describe, expect, it } from "bun:test";
import { buildSubagentInvocation, buildSubagentPrompt } from "./pi-config.ts";

describe("pi config", () => {
  it("builds a prompt from system prompt, context, and task", () => {
    const prompt = buildSubagentPrompt({
      systemPrompt: "You are a focused coding subagent.",
      context: "Previous reply",
      task: "Implement the next step.",
    });

    expect(prompt).toContain("You are a focused coding subagent.");
    expect(prompt).toContain("Context:\nPrevious reply");
    expect(prompt).toContain("Task:\nImplement the next step.");
  });

  it("returns execution config without PI coupling", () => {
    const invocation = buildSubagentInvocation({
      context: "ctx",
      task: "task",
      execution: { model: "test-model", outputMode: "json", maxTurns: 2 },
    });

    expect(invocation.prompt).toContain("Context:\nctx");
    expect(invocation.execution.model).toBe("test-model");
    expect(invocation.execution.outputMode).toBe("json");
    expect(invocation.execution.maxTurns).toBe(2);
  });
});
