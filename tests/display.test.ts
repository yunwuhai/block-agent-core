import { describe, expect, it } from "bun:test";
import {
  formatRunStart,
  formatRunEnd,
  formatToolCall,
  formatToolResult,
  formatHook,
  formatPolicyBlock,
  formatSlotChange,
  formatHandoff,
  renderCompact,
} from "../display/mod.ts";

describe("Display events format", () => {
  it("formatRunStart returns running status", () => {
    const event = formatRunStart("worker", "fix bugs");
    expect(event.type).toBe("run_start");
    expect(event.status).toBe("running");
  });

  it("formatRunEnd returns ok for success", () => {
    const event = formatRunEnd(true);
    expect(event.type).toBe("run_end");
    expect(event.status).toBe("ok");
  });

  it("formatRunEnd returns error for failure", () => {
    const event = formatRunEnd(false);
    expect(event.status).toBe("error");
  });

  it("formatToolCall includes expandable args when content exceeds threshold", () => {
    const large = { path: "src/foo.ts", extra: "x".repeat(250) };
    const event = formatToolCall("read", large);
    expect(event.type).toBe("tool_call");
    expect(event.expandable).toBeDefined();
    expect(event.expandable!.body).toContain("src/foo.ts");
  });

  it("formatToolCall omits expandable for small args", () => {
    const event = formatToolCall("read", { path: "src/foo.ts" });
    expect(event.type).toBe("tool_call");
    expect(event.expandable).toBeUndefined();
  });

  it("formatToolResult truncates long output in detail", () => {
    const long = "x".repeat(500);
    const event = formatToolResult("grep", long, false);
    expect(event.type).toBe("tool_result");
    expect(event.detail.length).toBeLessThan(250);
    expect(event.expandable).toBeDefined();
  });

  it("formatHook shows phase and script", () => {
    const event = formatHook("before_agent", "./hooks/setup.sh", true);
    expect(event.status).toBe("ok");
    expect(event.label).toContain("before_agent");
  });

  it("formatPolicyBlock shows blocked status", () => {
    const event = formatPolicyBlock("file not allowed");
    expect(event.status).toBe("blocked");
  });

  it("formatSlotChange shows operation", () => {
    const event = formatSlotChange("greeting", "set");
    expect(event.type).toBe("slot");
    expect(event.label).toContain("set");
  });

  it("formatHandoff shows path", () => {
    const event = formatHandoff(".pi/subagents/runs/abc/handoff.md");
    expect(event.type).toBe("handoff");
    expect(event.status).toBe("ok");
  });

  it("renderCompact for blocked event", () => {
    const event = formatPolicyBlock("access denied");
    const line = renderCompact(event, 0);
    expect(line).toContain("🚫");
  });

  it("renderCompact for ok event", () => {
    const event = formatHandoff("path");
    const line = renderCompact(event, 1);
    expect(line).toContain("✅");
  });
});
