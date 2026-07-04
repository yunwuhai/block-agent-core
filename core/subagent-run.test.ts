import { describe, expect, it } from "bun:test";
import {
  composeSubagentTurnId,
  normalizeToolNames,
  usesOnlyBuiltinTools,
} from "./subagent-run.ts";

describe("subagent run helpers", () => {
  it("composes turn ids from run id and key parts", () => {
    expect(composeSubagentTurnId({
      prefix: "turn",
      runId: "run-001",
      keyParts: ["input-a", "retry-0"],
    })).toBe("turn:run-001:input-a:retry-0");
  });

  it("uses explicit tool selection when provided", () => {
    expect(normalizeToolNames({
      names: ["read", "bash", "read"],
    })).toEqual(["read", "bash"]);
  });

  it("falls back to the default PI tool set", () => {
    expect(normalizeToolNames()).toEqual(["read", "bash", "edit", "write"]);
  });

  it("detects non-builtin tools", () => {
    expect(usesOnlyBuiltinTools(["read", "write"])).toBe(true);
    expect(usesOnlyBuiltinTools(["read", "custom_tool"])).toBe(false);
  });
});
