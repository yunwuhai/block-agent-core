import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
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
  expireStaleSlots,
  clearHookSlots,
  serializeSlots,
  deserializeSlots,
  registerPlaceholder,
  unregisterPlaceholder,
  listPlaceholders,
} from "./engine.ts";

afterEach(() => {
  reset();
});

// ---------------------------------------------------------------------------
// Traditional slot tests (unchanged logic, updated to async renderPrompt)
// ---------------------------------------------------------------------------

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

  it("once slot is consumed in renderPrompt", async () => {
    setOnceSlot("onetime", "Use once");
    await renderPrompt("base");
    expect(listSlots().has("onetime")).toBe(false);
  });

  it("renders prompt with slots prepended", async () => {
    setSlot("header", "# Header", undefined, 1);
    setSlot("footer", "_Footer_", undefined, -1);
    const result = await renderPrompt("Base content");
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

  it("expires slots past their TTL on renderPrompt", async () => {
    setSlot("ephemeral", "I expire", undefined, -1, 0);
    expect(listSlots().has("ephemeral")).toBe(true);
    await renderPrompt("base");
    expect(listSlots().has("ephemeral")).toBe(false);
  });

  it("expireStaleSlots removes slots past TTL and returns expired names", () => {
    setSlot("fast", "gone", undefined, -1, 0);
    setSlot("persistent", "stays", undefined, -1);
    expect(listSlots().has("fast")).toBe(true);
    expect(listSlots().has("persistent")).toBe(true);

    const expired = expireStaleSlots();
    expect(expired).toContain("fast");
    expect(expired).not.toContain("persistent");
    expect(listSlots().has("fast")).toBe(false);
    expect(listSlots().has("persistent")).toBe(true);
  });

  it("clearHookSlots removes hook_ prefixed slots but preserves others", () => {
    setSlot("hook_before_agent_worker", "hook output");
    setSlot("mySlot", "user data");

    clearHookSlots();
    expect(listSlots().has("hook_before_agent_worker")).toBe(false);
    expect(listSlots().has("mySlot")).toBe(true);
  });

  it("setOnceSlot accepts optional TTL", () => {
    setOnceSlot("onetime_ttl", "expires", undefined, 10000);
    const slot = listSlots().get("onetime_ttl");
    expect(slot?.consumes).toBe(1);
    expect(slot?.ttl).toBeGreaterThan(Date.now());
  });
});

// ---------------------------------------------------------------------------
// Placeholder system tests
// ---------------------------------------------------------------------------

describe("Placeholder system", () => {
  const TMP = resolve("/tmp/efficiency-subagent-placeholder-test-" + randomUUID().slice(0, 8));

  afterEach(() => {
    try { rmSync(TMP, { recursive: true, force: true }); } catch { /* ok */ }
    reset();
  });

  function makeFixture(name: string, content: string): string {
    mkdirSync(TMP, { recursive: true });
    const p = resolve(TMP, name);
    writeFileSync(p, content, "utf-8");
    return p;
  }

  it("registerPlaceholder binds a name to a file path", () => {
    const filePath = makeFixture("greeting.md", "# Hello World");
    registerPlaceholder("intro", filePath);

    const placeholders = listPlaceholders();
    expect(placeholders.has("intro")).toBe(true);
    expect(placeholders.get("intro")?.filePath).toBe(filePath);
  });

  it("unregisterPlaceholder removes a binding and returns true", () => {
    const filePath = makeFixture("greeting.md", "# Hello");
    registerPlaceholder("intro", filePath);
    expect(unregisterPlaceholder("intro")).toBe(true);
    expect(listPlaceholders().has("intro")).toBe(false);
  });

  it("unregisterPlaceholder returns false for unknown name", () => {
    expect(unregisterPlaceholder("nonexistent")).toBe(false);
  });

  it("renderPrompt replaces {{name}} with file content", async () => {
    const filePath = makeFixture("context.md", "## Project Context\nThis is a test project.");
    registerPlaceholder("context", filePath);

    const base = "Your task: ${task}\n\n{{context}}\n\nStart working.";
    const result = await renderPrompt(base);

    expect(result).toContain("## Project Context");
    expect(result).toContain("This is a test project.");
    expect(result).toContain("Your task:");
    expect(result).not.toContain("{{context}}");
  });

  it("renderPrompt replaces multiple different placeholders", async () => {
    const ctxPath = makeFixture("context.md", "Context content.");
    const rulesPath = makeFixture("rules.md", "Rules content.");

    registerPlaceholder("context", ctxPath);
    registerPlaceholder("rules", rulesPath);

    const base = "{{rules}}\n---\n{{context}}\n---\nBase prompt.";
    const result = await renderPrompt(base);

    expect(result).toContain("Rules content.");
    expect(result).toContain("Context content.");
    expect(result).toContain("Base prompt.");
    expect(result).not.toContain("{{context}}");
    expect(result).not.toContain("{{rules}}");
  });

  it("renderPrompt replaces same placeholder appearing multiple times", async () => {
    const filePath = makeFixture("title.md", "IMPORTANT");
    registerPlaceholder("title", filePath);

    const base = "{{title}}: Step 1\n\n{{title}}: Step 2";
    const result = await renderPrompt(base);

    expect(result).toBe("IMPORTANT: Step 1\n\nIMPORTANT: Step 2");
  });

  it("unregistered placeholders are left as-is", async () => {
    const base = "Use {{unknown_slot}} and {{another}} in your answer.";
    const result = await renderPrompt(base);

    expect(result).toContain("{{unknown_slot}}");
    expect(result).toContain("{{another}}");
  });

  it("unregistered placeholders after unregister are left as-is", async () => {
    const filePath = makeFixture("temp.md", "Temporary content");
    registerPlaceholder("temp", filePath);

    // First render — should replace
    const r1 = await renderPrompt("{{temp}}");
    expect(r1).toContain("Temporary content");

    // Unregister
    unregisterPlaceholder("temp");

    // Second render — should keep as-is
    const r2 = await renderPrompt("{{temp}}");
    expect(r2).toContain("{{temp}}");
    expect(r2).not.toContain("Temporary content");
  });

  it("missing file keeps the placeholder text (graceful degradation)", async () => {
    const missingPath = resolve(TMP, "does-not-exist.md");
    registerPlaceholder("broken", missingPath);

    const result = await renderPrompt("{{broken}} and more text");
    expect(result).toContain("{{broken}}");
    expect(result).toContain("and more text");
  });

  it("empty placeholder file replaces with empty string", async () => {
    const filePath = makeFixture("empty.md", "");
    registerPlaceholder("empty", filePath);

    const result = await renderPrompt("Before{{empty}}After");
    expect(result).toBe("BeforeAfter");
  });

  it("placeholder event log records register and unregister", () => {
    const filePath = makeFixture("log.md", "test");
    registerPlaceholder("log", filePath);

    const log = getEventLog();
    const registerEntry = log.find((e) => e.operation === "register_placeholder");
    expect(registerEntry?.slotName).toBe("log");
    expect(registerEntry?.content).toBe(filePath);

    unregisterPlaceholder("log");
    const unregisterEntry = log.find((e) => e.operation === "unregister_placeholder");
    expect(unregisterEntry?.slotName).toBe("log");
  });

  it("placeholder replacement coexists with traditional slot prepend", async () => {
    const filePath = makeFixture("rules.md", "RULES CONTENT");
    registerPlaceholder("rules", filePath);
    setSlot("header", "SLOT HEADER", 1);

    const base = "{{rules}}\n\nBase here.";
    const result = await renderPrompt(base);

    // Traditional slot prepended first
    expect(result).toContain("SLOT HEADER");
    // Placeholder replaced
    expect(result).toContain("RULES CONTENT");
    // Base preserved
    expect(result).toContain("Base here.");
    // No placeholder text remaining
    expect(result).not.toContain("{{rules}}");
    // Slot appears before resolved base
    const slotPos = result.indexOf("SLOT HEADER");
    const basePos = result.indexOf("Base here.");
    expect(slotPos).toBeLessThan(basePos);
  });

  it("reset clears placeholders as well as slots", () => {
    const filePath = makeFixture("will-clear.md", "content");
    registerPlaceholder("will_clear", filePath);
    setSlot("s", "v");
    expect(listPlaceholders().size).toBe(1);
    expect(listSlots().size).toBe(1);

    reset();

    expect(listPlaceholders().size).toBe(0);
    expect(listSlots().size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Slot serialization (updated to include placeholders)
// ---------------------------------------------------------------------------

describe("Slot serialization", () => {
  it("serializeSlots round-trip preserves all slots and their content", () => {
    reset();
    setSlot("alpha", "content A", 0, -1);
    setSlot("beta", "content B", 1, 2);
    setOnceSlot("gamma", "one-shot", 5, 30000);

    const serialized = serializeSlots();
    expect(Object.keys(serialized.slots)).toHaveLength(3);
    expect(serialized.slots["alpha"]!.content).toBe("content A");
    expect(serialized.slots["beta"]!.priority).toBe(1);
    expect(serialized.slots["beta"]!.consumes).toBe(2);
    expect(serialized.slots["gamma"]!.consumes).toBe(1);

    // Clear and deserialize
    reset();
    expect(listSlots().size).toBe(0);

    deserializeSlots(serialized);
    expect(listSlots().size).toBe(3);
    expect(listSlots().get("alpha")?.content).toBe("content A");
    expect(listSlots().get("beta")?.priority).toBe(1);
    expect(listSlots().get("gamma")?.consumes).toBe(1);
  });

  it("serializeSlots round-trip preserves stack slots", () => {
    reset();
    pushSlot("stack", "item 1");
    pushSlot("stack", "item 2");

    const serialized = serializeSlots();
    expect(serialized.stacks["stack"]).toHaveLength(2);

    reset();
    deserializeSlots(serialized);

    expect(popSlot("stack")).toBe("item 2");
    expect(popSlot("stack")).toBe("item 1");
  });

  it("deserializeSlots into non-empty state replaces everything", () => {
    reset();
    setSlot("old", "should be replaced");
    expect(listSlots().size).toBe(1);

    const data = serializeSlots(); // capture "old"
    reset(); // clear
    setSlot("new", "survives"); // set something new
    deserializeSlots(data); // restore "old", replacing "new"

    expect(listSlots().size).toBe(1);
    expect(listSlots().get("old")?.content).toBe("should be replaced");
    expect(listSlots().has("new")).toBe(false);
  });

  it("serializeSlots produces valid JSON that can be parsed back", () => {
    reset();
    setSlot("x", "hello", 3, -1);
    setOnceSlot("y", "world");

    const json = JSON.stringify(serializeSlots());
    const parsed = JSON.parse(json);

    expect(parsed.slots["x"].content).toBe("hello");
    expect(parsed.slots["x"].priority).toBe(3);
    expect(parsed.slots["y"].consumes).toBe(1);
  });

  // New: placeholder serialization tests
  it("serializeSlots round-trip preserves placeholders", () => {
    reset();
    setSlot("alpha", "content A");
    registerPlaceholder("ctx", "/absolute/path/to/context.md");
    registerPlaceholder("rules", "./rules.md"); // relative path gets resolved at registration

    const serialized = serializeSlots();
    expect(Object.keys(serialized.placeholders)).toHaveLength(2);
    expect(serialized.placeholders["ctx"]).toContain("context.md");
    expect(serialized.placeholders["rules"]).toContain("rules.md");

    reset();
    expect(listPlaceholders().size).toBe(0);
    expect(listSlots().size).toBe(0);

    deserializeSlots(serialized);
    expect(listSlots().size).toBe(1);
    expect(listPlaceholders().size).toBe(2);
    expect(listPlaceholders().get("ctx")?.filePath).toContain("context.md");
  });

  it("deserializeSlots with no placeholders field is backward-compatible", () => {
    reset();
    setSlot("x", "hello");
    const data = serializeSlots();
    // Simulate old-format data without placeholders key
    const oldFormat = { slots: data.slots, stacks: data.stacks };

    reset();
    deserializeSlots(oldFormat as any);
    expect(listSlots().size).toBe(1);
    expect(listPlaceholders().size).toBe(0); // no crash
  });
});
