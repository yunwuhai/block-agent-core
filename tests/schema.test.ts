import { describe, expect, it } from "bun:test";
import { ActionSchema, ToolParamsSchema, ProfileFrontmatterSchema, ProjectPolicySchema } from "../config/mod.ts";

describe("ToolParamsSchema", () => {
  it("accepts valid profile+task", () => {
    const result = ToolParamsSchema.safeParse({ profile: "worker", task: "fix bugs" });
    expect(result.success).toBe(true);
  });

  it("accepts profile+task+runId", () => {
    const result = ToolParamsSchema.safeParse({ profile: "worker", task: "fix bugs", runId: "abc123" });
    expect(result.success).toBe(true);
  });

  it("accepts profile+task+actions array", () => {
    const result = ToolParamsSchema.safeParse({
      profile: "worker",
      task: "test",
      actions: [
        { toolName: "mkdir", command: "mkdir dir" },
        { toolName: "write", filePath: "dir/test.txt" },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.actions?.length).toBe(2);
    }
  });

  it("accepts profile+task without actions (optional)", () => {
    const result = ToolParamsSchema.safeParse({ profile: "worker", task: "test" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.actions).toBeUndefined();
    }
  });

  it("rejects missing profile", () => {
    const result = ToolParamsSchema.safeParse({ task: "fix bugs" });
    expect(result.success).toBe(false);
  });

  it("rejects missing task", () => {
    const result = ToolParamsSchema.safeParse({ profile: "worker" });
    expect(result.success).toBe(false);
  });

  it("accepts extra keys (strips silently)", () => {
    const result = ToolParamsSchema.safeParse({ profile: "worker", task: "x", workflow: { spec: {} } });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ profile: "worker", task: "x" });
    }
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
      tools: ["read", "bash"],
      hooks: {
        before_agent: ["setup", "security-check"],
        tools: {
          read: { before: ["log-access"] },
        },
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("ProjectPolicySchema", () => {
  it("accepts empty config", () => {
    const result = ProjectPolicySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts bash deny list", () => {
    const result = ProjectPolicySchema.safeParse({
      bash: { deny: ["rm", "sudo"] },
    });
    expect(result.success).toBe(true);
  });
});

describe("ActionSchema", () => {
  it("accepts minimal action (toolName only)", () => {
    const result = ActionSchema.safeParse({ toolName: "read" });
    expect(result.success).toBe(true);
  });

  it("accepts action with filePath", () => {
    const result = ActionSchema.safeParse({ toolName: "read", filePath: "foo.txt" });
    expect(result.success).toBe(true);
  });

  it("accepts action with command", () => {
    const result = ActionSchema.safeParse({ toolName: "bash", command: "ls" });
    expect(result.success).toBe(true);
  });

  it("rejects action with empty toolName", () => {
    const result = ActionSchema.safeParse({ toolName: "" });
    expect(result.success).toBe(false);
  });

  it("rejects action missing toolName", () => {
    const result = ActionSchema.safeParse({ filePath: "x" });
    expect(result.success).toBe(false);
  });
});
