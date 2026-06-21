import { describe, expect, it } from "bun:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import extension from "./index.ts";

describe("Efficiency Subagent extension", () => {
  it("exports a function as default", () => {
    expect(typeof extension).toBe("function");
  });

  it("registers one tool with correct name and label", () => {
    const registered: Array<Record<string, unknown>> = [];
    const fakeApi = {
      registerTool: (tool: Record<string, unknown>) => {
        registered.push(tool);
      },
    } as ExtensionAPI;
    extension(fakeApi);
    expect(registered).toHaveLength(1);
    const tool = registered[0];
    expect(tool?.name).toBe("efficiency_subagent");
    expect(tool?.label).toBe("Efficiency Subagent");
  });

  it("params require profile and task", () => {
    const registered: Array<Record<string, unknown>> = [];
    const fakeApi = {
      registerTool: (tool: Record<string, unknown>) => {
        registered.push(tool);
      },
    } as ExtensionAPI;
    extension(fakeApi);
    const tool = registered[0];
    const params = tool?.parameters as Record<string, unknown> | undefined;
    expect(params?.required).toContain("profile");
    expect(params?.required).toContain("task");
  });

  it("rejects invalid params in execute", async () => {
    let capturedTool: Record<string, unknown> | undefined;
    const fakeApi = {
      registerTool: (tool: Record<string, unknown>) => {
        capturedTool = tool;
      },
    } as ExtensionAPI;
    extension(fakeApi);
    const exec = capturedTool?.execute as ((toolCallId: string, params: unknown) => Promise<Record<string, unknown>>) | undefined;
    expect(exec).toBeDefined();
    const result = await exec!("", {});
    expect(result.isError).toBe(true);
  });

  it("renderCall formats profile and task", () => {
    let capturedTool: Record<string, unknown> | undefined;
    const fakeApi = {
      registerTool: (tool: Record<string, unknown>) => {
        capturedTool = tool;
      },
    } as ExtensionAPI;
    extension(fakeApi);
    const render = capturedTool?.renderCall as ((params: Record<string, unknown>) => { render(): string }) | undefined;
    const output = render!({ profile: "worker", task: "fix bugs" }).render();
    expect(output).toContain("worker");
    expect(output).toContain("fix bugs");
  });
});
