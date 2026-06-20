import { afterEach, describe, expect, it } from "bun:test";
import {
  setSlot,
  clearSlot,
  pushSlot,
  popSlot,
  setOnceSlot,
  listSlots,
  renderPrompt,
  getEventLog,
  reset,
} from "../runtime/prompt-slots/engine.ts";

afterEach(() => {
  reset();
});

describe("Prompt slots engine", () => {
  it("sets and lists a slot", () => {
    setSlot("greeting", "Hello", undefined, 0);
    const slots = listSlots();
    expect(slots.has("greeting")).toBe(true);
    expect(slots.get("greeting")?.content).toBe("Hello");
  });

  it("clears a slot", () => {
    setSlot("greeting", "Hello");
    clearSlot("greeting");
    expect(listSlots().has("greeting")).toBe(false);
  });

  it("push and pop a stack slot", () => {
    pushSlot("notes", "first");
    pushSlot("notes", "second");
    const popped = popSlot("notes");
    expect(popped).toBe("second");
    expect(popSlot("notes")).toBe("first");
    expect(popSlot("notes")).toBeUndefined();
  });

  it("once slot is consumed in renderPrompt", () => {
    setOnceSlot("onetime", "Use once");
    renderPrompt("base");
    expect(listSlots().has("onetime")).toBe(false);
  });

  it("renders prompt with slots prepended", () => {
    setSlot("header", "# Header", undefined, 1);
    setSlot("footer", "_Footer_", undefined, -1);
    const result = renderPrompt("Base content");
    expect(result).toContain("# Header");
    expect(result).toContain("_Footer_");
    expect(result).toContain("Base content");
  });

  it("logs slot operations", () => {
    setSlot("x", "data");
    const log = getEventLog();
    expect(log).toHaveLength(1);
    expect(log[0]?.operation).toBe("set");
    expect(log[0]?.slotName).toBe("x");
  });
});
