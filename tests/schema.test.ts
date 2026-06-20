import { describe, expect, it } from "bun:test";
import { ToolParamsSchema, ProfileFrontmatterSchema, ProjectConfigSchema } from "../config/mod.ts";

describe("ToolParamsSchema", () => {
  it("accepts valid profile+task", () => {
    const result = ToolParamsSchema.safeParse({ profile: "worker", task: "fix bugs" });
    expect(result.success).toBe(true);
  });

  it("accepts profile+task+runId", () => {
    const result = ToolParamsSchema.safeParse({ profile: "worker", task: "fix bugs", runId: "abc123" });
    expect(result.success).toBe(true);
  });

  it("rejects missing profile", () => {
    const result = ToolParamsSchema.safeParse({ task: "fix bugs" });
    expect(result.success).toBe(false);
  });

  it("rejects missing task", () => {
    const result = ToolParamsSchema.safeParse({ profile: "worker" });
    expect(result.success).toBe(false);
  });

  it("rejects extra workflow-like keys", () => {
    const result = ToolParamsSchema.safeParse({ profile: "worker", task: "x", workflow: { spec: {} } });
    expect(result.success).toBe(false);
  });
});

describe("ProfileFrontmatterSchema", () => {
  it("accepts minimal profile frontmatter", () => {
    const result = ProfileFrontmatterSchema.safeParse({ name: "worker" });
    expect(result.success).toBe(true);
  });

  it("accepts full profile frontmatter with hook scripts", () => {
    const result = ProfileFrontmatterSchema.safeParse({
      name: "worker",
      description: "General worker",
      model: "claude-sonnet-4-5",
      tools: ["read", "bash"],
      hookScripts: { before_agent: "./hooks/setup.sh" },
    });
    expect(result.success).toBe(true);
  });
});

describe("ProjectConfigSchema", () => {
  it("accepts empty config", () => {
    const result = ProjectConfigSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts locked bash deny list", () => {
    const result = ProjectConfigSchema.safeParse({
      locked: { bash: { deny: ["rm", "sudo"] } },
    });
    expect(result.success).toBe(true);
  });
});
