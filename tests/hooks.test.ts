import { describe, expect, it } from "bun:test";
import { runHookScript } from "../runtime/hooks/runner.ts";
import { injectHookOutputAsSlot } from "../runtime/hooks/slot-insertion.ts";
import { listSlots, reset } from "../runtime/prompt-slots/engine.ts";
import { writeFileSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";

describe("Hook script runner", () => {
  it("runs a script and captures stdout", async () => {
    const tmp = `/tmp/hook-test-${randomUUID().slice(0, 8)}.sh`;
    writeFileSync(tmp, "#!/bin/bash\necho 'hook output'", { mode: 0o755 });
    try {
      const result = await runHookScript(tmp);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("hook output");
    } finally {
      unlinkSync(tmp);
    }
  });

  it("runs a script with input", async () => {
    const tmp = `/tmp/hook-test-${randomUUID().slice(0, 8)}.sh`;
    writeFileSync(tmp, "#!/bin/bash\ncat", { mode: 0o755 });
    try {
      const result = await runHookScript(tmp, { key: "value" });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("key");
    } finally {
      unlinkSync(tmp);
    }
  });

  it("reports failure on nonexistent script", async () => {
    const result = await runHookScript("/nonexistent/path.sh");
    expect(result.exitCode).not.toBe(0);
  });

  it("reports failure on script with nonzero exit", async () => {
    const tmp = `/tmp/hook-test-${randomUUID().slice(0, 8)}.sh`;
    writeFileSync(tmp, "#!/bin/bash\nexit 1", { mode: 0o755 });
    try {
      const result = await runHookScript(tmp);
      expect(result.exitCode).toBe(1);
    } finally {
      unlinkSync(tmp);
    }
  });
});

describe("Hook slot insertion", () => {
  it("injects hook output as a named slot", () => {
    reset();
    injectHookOutputAsSlot("before_agent", { exitCode: 0, stdout: "SETUP OK", stderr: "" }, "test-profile");
    const slots = listSlots();
    expect(slots.has("hook_before_agent_test-profile")).toBe(true);
    expect(slots.get("hook_before_agent_test-profile")?.content).toContain("SETUP OK");
  });

  it("injects a no-output slot when hook has no stdout", () => {
    reset();
    injectHookOutputAsSlot("after_tool", { exitCode: 0, stdout: "", stderr: "" }, "test-profile");
    const slots = listSlots();
    expect(slots.has("hook_after_tool_test-profile")).toBe(true);
  });
});
