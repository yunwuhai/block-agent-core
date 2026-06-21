import { describe, expect, it } from "bun:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import extension from "./index.ts";

describe("Efficiency Subagent extension", () => {
  it("exports a function as default", () => {
    expect(typeof extension).toBe("function");
  });

  it("registers the efficiency_subagent tool", () => {
    const registered: Array<Record<string, unknown>> = [];
    const fakeApi = {
      registerTool: (tool: Record<string, unknown>) => {
        registered.push(tool);
      },
    } as unknown as ExtensionAPI;
    extension(fakeApi);
    expect(registered).toHaveLength(1);
    const tool0 = registered[0];
    expect(tool0?.name).toBe("efficiency_subagent");
    expect(tool0?.label).toBe("Efficiency Subagent");
  });

  it("params require profile and task", () => {
    const registered: Array<Record<string, unknown>> = [];
    const fakeApi = {
      registerTool: (tool: Record<string, unknown>) => {
        registered.push(tool);
      },
    } as unknown as ExtensionAPI;
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
    } as unknown as ExtensionAPI;
    extension(fakeApi);
    const exec = capturedTool?.execute as ((toolCallId: string, params: unknown) => Promise<Record<string, unknown>>) | undefined;
    expect(exec).toBeDefined();
    const result = await exec!("", {});
    expect(result.terminate).toBe(true);
    const content = result.content as Array<{ text?: string }>;
    expect(content[0]?.text).toContain("Invalid params");
  });

  it("renderCall formats profile and task", () => {
    const registered: Array<Record<string, unknown>> = [];
    const fakeApi = {
      registerTool: (tool: Record<string, unknown>) => {
        registered.push(tool);
      },
    } as unknown as ExtensionAPI;
    extension(fakeApi);
    const tool = registered.find((t) => t.name === "efficiency_subagent");
    const render = tool?.renderCall as ((params: Record<string, unknown>) => { render(width: number): string[] }) | undefined;
    const output = render!({ profile: "worker", task: "fix bugs" }).render(80).join("\n");
    expect(output).toContain("worker");
    expect(output).toContain("fix bugs");
  });
});
