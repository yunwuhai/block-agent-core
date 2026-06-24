import { describe, expect, it } from "bun:test";
import { evaluate } from "./evaluator.ts";
import type { Action, Policy } from "./types.ts";

describe("Policy evaluator — tool whitelist", () => {
  const policy: Policy = { allowTools: ["read", "bash"] };

  it("allows tool in allowTools", () => {
    const action: Action = { type: "read" };
    expect(evaluate(action, policy).allowed).toBe(true);
  });

  it("blocks tool not in allowTools", () => {
    const action: Action = { type: "write" };
    const result = evaluate(action, policy);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("allowTools");
  });
});

describe("Policy evaluator — whitelist vs blacklist modes", () => {
  it("blocks when allowTools is specified and tool is absent (whitelist mode)", () => {
    const policy: Policy = { allowTools: ["read"] };
    expect(evaluate({ type: "bash" }, policy).allowed).toBe(false);
  });

  it("allows when allowTools is not specified (blacklist mode)", () => {
    const policy: Policy = {};
    expect(evaluate({ type: "bash" }, policy).allowed).toBe(true);
  });
});

describe("Policy evaluator — path allow/deny", () => {
  it("allows path in allowPaths", () => {
    const policy: Policy = { allowPaths: ["src/**"] };
    expect(evaluate({ type: "read", path: "src/main.ts" }, policy).allowed).toBe(true);
  });

  it("blocks path not in allowPaths", () => {
    const policy: Policy = { allowPaths: ["src/**"] };
    const result = evaluate({ type: "read", path: "secret.txt" }, policy);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("allowPaths");
  });

  it("denyPaths overrides allowPaths", () => {
    const policy: Policy = { allowPaths: ["src/**"], denyPaths: ["src/secret/**"] };
    expect(evaluate({ type: "read", path: "src/main.ts" }, policy).allowed).toBe(true);
    expect(evaluate({ type: "read", path: "src/secret/key.ts" }, policy).allowed).toBe(false);
  });

  it("denyPath alone blocks even without allowPaths", () => {
    const policy: Policy = { denyPaths: ["/tmp/**"] };
    const result = evaluate({ type: "bash", path: "/tmp/foo" }, policy);
    expect(result.allowed).toBe(false);
    expect(result.rule).toBe("denyPaths");
  });

  it("allows any path when allowPaths is not set and no denyPaths match", () => {
    const policy: Policy = {};
    expect(evaluate({ type: "read", path: "anything.txt" }, policy).allowed).toBe(true);
  });
});

describe("Policy evaluator — bash rules", () => {
  it("denyCommands blocks matching command", () => {
    const policy: Policy = { bashRules: [{ denyCommands: ["rm"] }] };
    const result = evaluate({ type: "bash", command: "rm -rf /" }, policy);
    expect(result.allowed).toBe(false);
    expect(result.rule).toBe("bashRules.denyCommands");
  });

  it("allowCommands allows matching command", () => {
    const policy: Policy = { bashRules: [{ allowCommands: ["git"] }] };
    expect(evaluate({ type: "bash", command: "git status" }, policy).allowed).toBe(true);
  });

  it("blocks command not in allowCommands", () => {
    const policy: Policy = { bashRules: [{ allowCommands: ["git"] }] };
    const result = evaluate({ type: "bash", command: "rm file" }, policy);
    expect(result.allowed).toBe(false);
  });

  it("denyPatterns blocks via glob", () => {
    const policy: Policy = { bashRules: [{ denyPatterns: ["sudo *"] }] };
    const result = evaluate({ type: "bash", command: "sudo rm -rf /" }, policy);
    expect(result.allowed).toBe(false);
  });

  it("allowPatterns allows via glob", () => {
    const policy: Policy = { bashRules: [{ allowPatterns: ["git *"] }] };
    expect(evaluate({ type: "bash", command: "git log" }, policy).allowed).toBe(true);
  });
});

describe("Policy evaluator — capabilities", () => {
  it("blocks denied capability", () => {
    const policy: Policy = { denyCapabilities: ["admin"] };
    const result = evaluate({ type: "capability", env: "admin" }, policy);
    expect(result.allowed).toBe(false);
  });

  it("allows only listed capabilities when allowCapabilities set", () => {
    const policy: Policy = { allowCapabilities: ["read-only"] };
    expect(evaluate({ type: "capability", env: "read-only" }, policy).allowed).toBe(true);
    const result = evaluate({ type: "capability", env: "admin" }, policy);
    expect(result.allowed).toBe(false);
  });
});

describe("Policy evaluator — subagent control", () => {
  it("blocks subagent calls when allowSubagent is false", () => {
    const policy: Policy = { allowSubagent: false };
    const result = evaluate({ type: "subagent" }, policy);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("subagent");
  });
});

describe("Policy evaluator — null policy", () => {
  it("allows everything when policy is null", () => {
    const result = evaluate({ type: "anything" }, null);
    expect(result.allowed).toBe(true);
  });
});
