import { describe, expect, it } from "bun:test";
import { mergePolicies } from "../policy/merge.ts";
import { evaluate } from "../policy/evaluator.ts";
import type { MergedPolicy } from "../policy/mod.ts";

describe("Policy merge", () => {
  it("merges multiple policy layers", () => {
    const merged = mergePolicies(
      { tools: ["read"] },
      { tools: ["bash"], paths: ["src/**"] },
    );
    expect(merged.tools).toContain("read");
    expect(merged.tools).toContain("bash");
    expect(merged.paths).toContain("src/**");
  });

  it("returns null fields for empty input", () => {
    const merged = mergePolicies();
    expect(merged.tools).toBeNull();
    expect(merged.paths).toBeNull();
  });
});

describe("Policy evaluator", () => {
  const fullPolicy: MergedPolicy = {
    tools: ["read", "bash", "efficiency_subagent"],
    paths: ["src/**", "README.md"],
    bash: { deny: ["rm", "sudo"], allow: ["git"] },
    network: { allow: false, allowedDomains: ["api.example.com"], deniedDomains: ["evil.com"] },
    env: { deny: ["SECRET_KEY"] },
  };

  it("allows tool in list", () => {
    const result = evaluate({ toolName: "read" }, fullPolicy);
    expect(result.allowed).toBe(true);
  });

  it("blocks tool not in list", () => {
    const result = evaluate({ toolName: "delete" }, fullPolicy);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not in allowed list");
  });

  it("allows file in path", () => {
    const result = evaluate({ toolName: "read", filePath: "src/foo.ts" }, fullPolicy);
    expect(result.allowed).toBe(true);
  });

  it("blocks file not in path", () => {
    const result = evaluate({ toolName: "read", filePath: "secret.env" }, fullPolicy);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not allowed");
  });

  it("denies rm command", () => {
    const result = evaluate({ toolName: "bash", command: "rm -rf /" }, fullPolicy);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("denied");
  });

  it("allows git command in allowlist", () => {
    const result = evaluate({ toolName: "bash", command: "git status" }, fullPolicy);
    expect(result.allowed).toBe(true);
  });

  it("blocks network to unauthorized domain", () => {
    const result = evaluate({ toolName: "read", url: "https://evil.com/data" }, fullPolicy);
    expect(result.allowed).toBe(false);
  });

  it("allows network to allowed domain", () => {
    const result = evaluate({ toolName: "read", url: "https://api.example.com/v1" }, fullPolicy);
    expect(result.allowed).toBe(true);
  });

  it("blocks denied env var", () => {
    const result = evaluate({ toolName: "read", envVar: "SECRET_KEY" }, fullPolicy);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("denied");
  });

  it("blocks nested subagent calls", () => {
    const result = evaluate({ toolName: "efficiency_subagent", isNestedSubagent: true }, {
      tools: ["read"],
      paths: null,
      bash: null,
      network: null,
      env: null,
    });
    expect(result.allowed).toBe(false);
  });

  it("allows everything when no policy", () => {
    const result = evaluate({ toolName: "anything" }, null);
    expect(result.allowed).toBe(true);
  });

  it("extracts mkdir paths for policy check", () => {
    const policy: MergedPolicy = { tools: null, paths: ["novel-writer/**"], bash: null, network: null, env: null };
    expect(evaluate({ toolName: "bash", command: "mkdir novel-writer/test" }, policy).allowed).toBe(true);
    expect(evaluate({ toolName: "bash", command: "mkdir /tmp/forbidden" }, policy).allowed).toBe(false);
  });

  it("extracts mv paths for policy check", () => {
    const policy: MergedPolicy = { tools: null, paths: ["old", "new"], bash: null, network: null, env: null };
    expect(evaluate({ toolName: "bash", command: "mv old new" }, policy).allowed).toBe(true);
  });

  it("extracts touch paths for policy check", () => {
    const policy: MergedPolicy = { tools: null, paths: ["foo.txt"], bash: null, network: null, env: null };
    expect(evaluate({ toolName: "bash", command: "touch foo.txt" }, policy).allowed).toBe(true);
  });

  it("extracts cp paths for policy check", () => {
    const policy: MergedPolicy = { tools: null, paths: ["src/**", "dest/**"], bash: null, network: null, env: null };
    expect(evaluate({ toolName: "bash", command: "cp src/file dest/" }, policy).allowed).toBe(true);
  });

  it("blocks bash path via excludePaths (deny wins)", () => {
    const policy: MergedPolicy = { tools: null, paths: ["excluded-dir"], excludePaths: ["excluded-dir"], bash: null, network: null, env: null };
    const result = evaluate({ toolName: "bash", command: "mkdir excluded-dir" }, policy);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("excludePaths");
  });

  it("skips path extraction for flag-only commands", () => {
    const policy: MergedPolicy = { tools: null, paths: ["novel-writer/**"], bash: null, network: null, env: null };
    expect(evaluate({ toolName: "bash", command: "echo -n" }, policy).allowed).toBe(true);
  });

  it("extracts redirect target paths", () => {
    const allowedPolicy: MergedPolicy = { tools: null, paths: ["/tmp/**"], bash: null, network: null, env: null };
    expect(evaluate({ toolName: "bash", command: "echo>/tmp/out.txt" }, allowedPolicy).allowed).toBe(true);

    const blockedPolicy: MergedPolicy = { tools: null, paths: ["novel-writer/**"], bash: null, network: null, env: null };
    expect(evaluate({ toolName: "bash", command: "echo>/tmp/out.txt" }, blockedPolicy).allowed).toBe(false);
  });
});
