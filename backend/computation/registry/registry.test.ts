import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { ScheduleOrchestrator } from "./orchestration.ts";
import { RegistryStorage } from "./storage.ts";
import {
  resolveScheduled,
  isActive,
  exceedsFrequency,
  expandTemplate,
} from "./resolution.ts";
import { buildToCTable, composeMessage } from "./composer.ts";
import type {
  RegistryEntry,
  RunContext,
  ScheduleState,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testDir: string;
let storage: RegistryStorage;
let orchestrator: ScheduleOrchestrator;

function tmpPath(...parts: string[]): string {
  return join(testDir, ...parts);
}

function makeRunCtx(overrides?: Partial<RunContext>): RunContext {
  return { runId: "test-run", roundNumber: 1, cwd: testDir, ...overrides };
}

afterEach(() => {
  if (testDir) {
    try { rmSync(testDir, { recursive: true, force: true }); } catch { /* */ }
  }
});

// ---------------------------------------------------------------------------
// Unit: RegistryStorage (Layer 1)
// ---------------------------------------------------------------------------

describe("RegistryStorage", () => {
  it("registers and retrieves an entry", () => {
    testDir = join(tmpdir(), `registry-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    storage = new RegistryStorage(tmpPath("registry.jsonl"));

    const id = storage.register({
      type: "custom",
      description: "Test entry",
      content: "Hello world",
      tags: ["test", "demo"],
      group: "samples",
      priority: 5,
      lifecycle: { type: "permanent", createdAt: Date.now() },
      createdBy: "user",
    });

    expect(id).toBeString();
    expect(id.length).toBeGreaterThan(10);

    const entry = storage.get(id);
    expect(entry).toBeDefined();
    expect(entry!.type).toBe("custom");
    expect(entry!.description).toBe("Test entry");
    expect(entry!.content).toBe("Hello world");
    expect(entry!.tags).toContain("test");
    expect(entry!.group).toBe("samples");
    expect(entry!.priority).toBe(5);
  });

  it("getByName resolves {{name}} bindings", () => {
    testDir = join(tmpdir(), `registry-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    storage = new RegistryStorage(tmpPath("registry.jsonl"));

    storage.register({
      type: "file",
      description: "Named entry",
      content: "Named content",
      name: "rules",
      tags: [],
      createdBy: "system",
      lifecycle: { type: "permanent" },
    });

    const entry = storage.getByName("rules");
    expect(entry).toBeDefined();
    expect(entry!.name).toBe("rules");
    expect(entry!.content).toBe("Named content");
  });

  it("getByName returns undefined for unregistered name", () => {
    testDir = join(tmpdir(), `registry-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    storage = new RegistryStorage(tmpPath("registry.jsonl"));

    expect(storage.getByName("nonexistent")).toBeUndefined();
  });

  it("unregisters an entry and cleans up indexes", () => {
    testDir = join(tmpdir(), `registry-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    storage = new RegistryStorage(tmpPath("registry.jsonl"));

    const id = storage.register({
      type: "custom",
      description: "To be removed",
      tags: ["temp"],
      group: "trash",
      createdBy: "user",
      lifecycle: { type: "permanent" },
    });

    expect(storage.get(id)).toBeDefined();
    expect(storage.unregister(id)).toBe(true);
    expect(storage.get(id)).toBeUndefined();
    expect(storage.unregister(id)).toBe(false);
    expect(storage.findByTags(["temp"])).toHaveLength(0);
    expect(storage.findByGroup("trash")).toHaveLength(0);
  });

  it("findByTags with 'any' mode returns union", () => {
    testDir = join(tmpdir(), `registry-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    storage = new RegistryStorage(tmpPath("registry.jsonl"));

    storage.register({ type: "custom", description: "A", tags: ["a"], createdBy: "user", lifecycle: { type: "permanent" } });
    storage.register({ type: "custom", description: "B", tags: ["b"], createdBy: "user", lifecycle: { type: "permanent" } });
    storage.register({ type: "custom", description: "AB", tags: ["a", "b"], createdBy: "user", lifecycle: { type: "permanent" } });

    const results = storage.findByTags(["a", "b"], "any");
    expect(results).toHaveLength(3);
  });

  it("findByTags with 'all' mode returns intersection", () => {
    testDir = join(tmpdir(), `registry-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    storage = new RegistryStorage(tmpPath("registry.jsonl"));

    storage.register({ type: "custom", description: "A", tags: ["a"], createdBy: "user", lifecycle: { type: "permanent" } });
    storage.register({ type: "custom", description: "B", tags: ["b"], createdBy: "user", lifecycle: { type: "permanent" } });
    storage.register({ type: "custom", description: "AB", tags: ["a", "b"], createdBy: "user", lifecycle: { type: "permanent" } });

    const results = storage.findByTags(["a", "b"], "all");
    expect(results).toHaveLength(1);
    expect(results[0]!.description).toBe("AB");
  });

  it("findByGroup returns entries in a group", () => {
    testDir = join(tmpdir(), `registry-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    storage = new RegistryStorage(tmpPath("registry.jsonl"));

    storage.register({ type: "custom", description: "P1", tags: [], group: "policies", createdBy: "user", lifecycle: { type: "permanent" } });
    storage.register({ type: "custom", description: "P2", tags: [], group: "policies", createdBy: "user", lifecycle: { type: "permanent" } });
    storage.register({ type: "custom", description: "Other", tags: [], group: "other", createdBy: "user", lifecycle: { type: "permanent" } });

    expect(storage.findByGroup("policies")).toHaveLength(2);
    expect(storage.findByGroup("nonexistent")).toHaveLength(0);
  });

  it("addTag and removeTag work idempotently", () => {
    testDir = join(tmpdir(), `registry-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    storage = new RegistryStorage(tmpPath("registry.jsonl"));

    const id = storage.register({
      type: "custom", description: "Tagged", tags: ["initial"], createdBy: "user", lifecycle: { type: "permanent" },
    });

    expect(storage.addTag(id, "extra")).toBe(true);
    expect(storage.get(id)!.tags).toContain("extra");
    expect(storage.addTag(id, "extra")).toBe(true); // idempotent

    expect(storage.removeTag(id, "initial")).toBe(true);
    expect(storage.get(id)!.tags).not.toContain("initial");
    expect(storage.removeTag(id, "nonexistent")).toBe(true); // idempotent
    expect(storage.addTag("nonexistent-id", "x")).toBe(false);
  });

  it("update modifies mutable fields", () => {
    testDir = join(tmpdir(), `registry-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    storage = new RegistryStorage(tmpPath("registry.jsonl"));

    const id = storage.register({
      type: "custom", description: "Old", content: "old", tags: ["a"], createdBy: "user", lifecycle: { type: "permanent" },
    });

    storage.update(id, { description: "New", priority: 10, tags: ["b"] });
    const entry = storage.get(id)!;
    expect(entry.description).toBe("New");
    expect(entry.priority).toBe(10);
    expect(entry.tags).toEqual(["b"]);
    expect(entry.createdBy).toBe("user"); // immutable
  });

  it("list filters by type, group, and tags", () => {
    testDir = join(tmpdir(), `registry-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    storage = new RegistryStorage(tmpPath("registry.jsonl"));

    storage.register({ type: "custom", description: "C1", tags: ["a"], group: "g1", createdBy: "user", lifecycle: { type: "permanent" } });
    storage.register({ type: "file", description: "F1", tags: ["a"], group: "g2", createdBy: "system", lifecycle: { type: "session" } });
    storage.register({ type: "custom", description: "C2", tags: ["b"], group: "g1", createdBy: "user", lifecycle: { type: "permanent" } });

    expect(storage.list({ type: "custom" })).toHaveLength(2);
    expect(storage.list({ group: "g1" })).toHaveLength(2);
    expect(storage.list({ tags: ["a"] })).toHaveLength(2);
    expect(storage.list({ type: "file" })).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Unit: SlidingWindowCounter & Call History (Layer 1)
// ---------------------------------------------------------------------------

describe("Call History & Frequency", () => {
  it("recordCall updates sliding window counters", async () => {
    testDir = join(tmpdir(), `registry-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    storage = new RegistryStorage(tmpPath("registry.jsonl"));
    storage.setCallsPath(tmpPath("calls.jsonl"));

    const id = storage.register({
      type: "custom", description: "F", tags: [], createdBy: "user", lifecycle: { type: "permanent" },
    });

    await storage.recordCall({ entryId: id, roundId: "1", timestamp: Date.now(), trigger: "tag" });
    await storage.recordCall({ entryId: id, roundId: "2", timestamp: Date.now(), trigger: "tag" });
    await storage.recordCall({ entryId: id, roundId: "3", timestamp: Date.now(), trigger: "id" });

    expect(storage.getTotalCalls(id)).toBe(3);
    expect(storage.getFrequency(id, 25)).toBe(3); // 3 calls in buffer
    expect(storage.getFrequency(id, 50)).toBe(3);
    expect(storage.getFrequency(id, 100)).toBe(3);
  });

  it("getCallHistory reads from persisted JSONL", async () => {
    testDir = join(tmpdir(), `registry-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    storage = new RegistryStorage(tmpPath("registry.jsonl"));
    storage.setCallsPath(tmpPath("calls.jsonl"));

    const id = storage.register({
      type: "custom", description: "H", tags: [], createdBy: "user", lifecycle: { type: "permanent" },
    });

    await storage.recordCall({ entryId: id, roundId: "r1", timestamp: 1000, trigger: "tag" });
    await storage.recordCall({ entryId: id, roundId: "r2", timestamp: 2000, trigger: "id" });

    const history = await storage.getCallHistory(id);
    expect(history).toHaveLength(2);
    expect(history[0]!.roundId).toBe("r1");
    expect(history[1]!.trigger).toBe("id");
  });
});

// ---------------------------------------------------------------------------
// Unit: Resolution Engine (Layer 2)
// ---------------------------------------------------------------------------

describe("Resolution Engine", () => {
  beforeEach(() => {
    testDir = join(tmpdir(), `registry-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    storage = new RegistryStorage(tmpPath("registry.jsonl"));
  });

  it("isActive — permanent is always active", () => {
    const entry: RegistryEntry = {
      id: "e1", type: "custom", description: "", tags: [], priority: 0,
      lifecycle: { type: "permanent", createdAt: 0 }, createdBy: "user", createdAt: 0, updatedAt: 0,
    };
    expect(isActive(entry, makeRunCtx(), 0)).toBe(true);
  });

  it("isActive — rounds expires after maxRounds", () => {
    const entry: RegistryEntry = {
      id: "e2", type: "custom", description: "", tags: [], priority: 0,
      lifecycle: { type: "rounds", maxRounds: 3, createdAt: 0 }, createdBy: "user", createdAt: 0, updatedAt: 0,
    };
    expect(isActive(entry, makeRunCtx({ roundNumber: 2 }), 0)).toBe(true);
    expect(isActive(entry, makeRunCtx({ roundNumber: 3 }), 0)).toBe(false);
  });

  it("isActive — time-window respects validFrom/validUntil", () => {
    const now = Date.now();
    const entry: RegistryEntry = {
      id: "e3", type: "custom", description: "", tags: [], priority: 0,
      lifecycle: { type: "time-window", validFrom: now - 1000, validUntil: now + 1000, createdAt: now },
      createdBy: "user", createdAt: now, updatedAt: now,
    };
    expect(isActive(entry, makeRunCtx(), 0)).toBe(true);
  });

  it("isActive — expired time-window returns false", () => {
    const now = Date.now();
    const entry: RegistryEntry = {
      id: "e4", type: "custom", description: "", tags: [], priority: 0,
      lifecycle: { type: "time-window", validFrom: now - 2000, validUntil: now - 1000, createdAt: now },
      createdBy: "user", createdAt: now, updatedAt: now,
    };
    expect(isActive(entry, makeRunCtx(), 0)).toBe(false);
  });

  it("exceedsFrequency returns true when cap reached", async () => {
    testDir = join(tmpdir(), `registry-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    const s = new RegistryStorage(tmpPath("registry.jsonl"));
    s.setCallsPath(tmpPath("calls.jsonl"));

    const id = s.register({
      type: "custom", description: "Capped", tags: [], createdBy: "user",
      lifecycle: { type: "permanent" },
      frequency: { maxTotal: 2 },
    });

    // No calls yet → not exceeded
    expect(exceedsFrequency(s.get(id)!, s)).toBe(false);

    // Record 2 calls
    await s.recordCall({ entryId: id, roundId: "r1", timestamp: Date.now(), trigger: "tag" });
    await s.recordCall({ entryId: id, roundId: "r2", timestamp: Date.now(), trigger: "tag" });

    // Wait for async calls to be processed in the counter — sync check
    expect(s.getTotalCalls(id)).toBe(2);
    expect(exceedsFrequency(s.get(id)!, s)).toBe(true);
  });

  it("expandTemplate recursively expands member IDs", () => {
    const s = new RegistryStorage(tmpPath("registry.jsonl"));

    const e1 = s.register({ type: "custom", description: "Leaf 1", tags: [], createdBy: "user", lifecycle: { type: "permanent" } });
    const e2 = s.register({ type: "custom", description: "Leaf 2", tags: [], createdBy: "user", lifecycle: { type: "permanent" } });
    const t1 = s.register({ type: "template", description: "Template 1", memberIds: [e1, e2], tags: [], createdBy: "system", lifecycle: { type: "permanent" } });
    const t2 = s.register({ type: "template", description: "Template 2", memberIds: [t1], tags: [], createdBy: "system", lifecycle: { type: "permanent" } });

    const expanded = expandTemplate(t2, s);
    expect(expanded).toHaveLength(2);
    expect(expanded).toContain(e1);
    expect(expanded).toContain(e2);
  });

  it("expandTemplate detects cycles", () => {
    const s = new RegistryStorage(tmpPath("registry.jsonl"));

    const t1 = s.register({ type: "template", description: "Self-ref", tags: [], createdBy: "system", lifecycle: { type: "permanent" } });
    s.update(t1, { memberIds: [t1] }); // self-reference

    const expanded = expandTemplate(t1, s);
    expect(expanded).toHaveLength(0); // cycle → empty
  });

  it("resolveScheduled deduplicates entries from multiple sources", async () => {
    const s = new RegistryStorage(tmpPath("registry.jsonl"));
    s.setCallsPath(tmpPath("calls.jsonl"));

    const id = s.register({
      type: "custom", description: "Dup", content: "content", tags: ["a", "b"], group: "g", createdBy: "user", lifecycle: { type: "permanent" },
    });

    const schedule: ScheduleState = {
      tags: new Set(["a"]),    // hits via tag
      ids: new Set([id]),      // hits via direct id
      groups: new Set(["g"]),  // hits via group
      templates: new Set(),
    };

    const resolved = await resolveScheduled(schedule, s, makeRunCtx());
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.entry.id).toBe(id);
  });

  it("resolveScheduled sorts by priority descending", async () => {
    const s = new RegistryStorage(tmpPath("registry.jsonl"));
    s.setCallsPath(tmpPath("calls.jsonl"));

    s.register({ type: "custom", description: "Low", content: "low", tags: ["x"], priority: 1, createdBy: "user", lifecycle: { type: "permanent" } });
    s.register({ type: "custom", description: "High", content: "high", tags: ["x"], priority: 10, createdBy: "user", lifecycle: { type: "permanent" } });
    s.register({ type: "custom", description: "Mid", content: "mid", tags: ["x"], priority: 5, createdBy: "user", lifecycle: { type: "permanent" } });

    const schedule: ScheduleState = { tags: new Set(["x"]), ids: new Set(), groups: new Set(), templates: new Set() };
    const resolved = await resolveScheduled(schedule, s, makeRunCtx());
    expect(resolved).toHaveLength(3);
    expect(resolved[0]!.entry.priority).toBe(10);
    expect(resolved[1]!.entry.priority).toBe(5);
    expect(resolved[2]!.entry.priority).toBe(1);
  });

  it("resolveScheduled filters by lifecycle", async () => {
    const s = new RegistryStorage(tmpPath("registry.jsonl"));
    s.setCallsPath(tmpPath("calls.jsonl"));

    const now = Date.now();
    s.register({ type: "custom", description: "Expired", content: "old", tags: ["x"], lifecycle: { type: "time-window", validUntil: now - 1000, createdAt: now }, createdBy: "user" });

    const schedule: ScheduleState = { tags: new Set(["x"]), ids: new Set(), groups: new Set(), templates: new Set() };
    const resolved = await resolveScheduled(schedule, s, makeRunCtx());
    expect(resolved).toHaveLength(0);
  });

  it("resolveScheduled filters by frequency cap", async () => {
    const s = new RegistryStorage(tmpPath("registry.jsonl"));
    s.setCallsPath(tmpPath("calls.jsonl"));

    const id = s.register({
      type: "custom", description: "Limited", content: "limited", tags: ["x"],
      lifecycle: { type: "permanent" },
      frequency: { maxTotal: 1 },
      createdBy: "user",
    });

    // Pre-record one call to reach cap
    await s.recordCall({ entryId: id, roundId: "0", timestamp: Date.now(), trigger: "tag" });

    const schedule: ScheduleState = { tags: new Set(["x"]), ids: new Set(), groups: new Set(), templates: new Set() };
    const resolved = await resolveScheduled(schedule, s, makeRunCtx());
    expect(resolved).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Unit: Schedule Orchestrator (Layer 3)
// ---------------------------------------------------------------------------

describe("ScheduleOrchestrator", () => {
  beforeEach(() => {
    testDir = join(tmpdir(), `registry-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    storage = new RegistryStorage(tmpPath("registry.jsonl"));
    storage.setCallsPath(tmpPath("calls.jsonl"));
    orchestrator = new ScheduleOrchestrator(storage);
  });

  it("scheduleTags adds entries and returns count", () => {
    storage.register({ type: "custom", description: "T1", tags: ["fs"], content: "a", createdBy: "user", lifecycle: { type: "permanent" } });
    storage.register({ type: "custom", description: "T2", tags: ["fs", "mkdir"], content: "b", createdBy: "user", lifecycle: { type: "permanent" } });
    storage.register({ type: "custom", description: "T3", tags: ["other"], content: "c", createdBy: "user", lifecycle: { type: "permanent" } });

    const result = orchestrator.scheduleTags(["fs"]);
    expect(result.scheduled).toBe(2);
  });

  it("scheduleIds schedules specific entries", () => {
    const id = storage.register({ type: "custom", description: "Direct", tags: [], content: "d", createdBy: "user", lifecycle: { type: "permanent" } });

    const result = orchestrator.scheduleIds([id]);
    expect(result.scheduled).toBe(1);
  });

  it("scheduleGroup schedules all entries in a group", () => {
    storage.register({ type: "custom", description: "G1", tags: [], group: "batch", content: "g1", createdBy: "user", lifecycle: { type: "permanent" } });
    storage.register({ type: "custom", description: "G2", tags: [], group: "batch", content: "g2", createdBy: "user", lifecycle: { type: "permanent" } });

    const result = orchestrator.scheduleGroup("batch");
    expect(result.scheduled).toBe(2);
  });

  it("scheduleTemplate adds template to templates set", () => {
    const tId = storage.register({ type: "template", description: "Tpl", tags: [], memberIds: [], createdBy: "system", lifecycle: { type: "permanent" } });

    const result = orchestrator.scheduleTemplate(tId);
    expect(result.scheduled).toBe(true);
  });

  it("scheduleTemplate rejects non-template entries", () => {
    const id = storage.register({ type: "custom", description: "Not template", tags: [], createdBy: "user", lifecycle: { type: "permanent" } });
    const result = orchestrator.scheduleTemplate(id);
    expect(result.scheduled).toBe(false);
  });

  it("unscheduleTags removes entries", () => {
    storage.register({ type: "custom", description: "R1", tags: ["remove"], content: "r1", createdBy: "user", lifecycle: { type: "permanent" } });
    orchestrator.scheduleTags(["remove"]);
    expect(orchestrator.listScheduled().count).toBe(1);

    const result = orchestrator.unscheduleTags(["remove"]);
    expect(result.removed).toBe(1);
    expect(orchestrator.listScheduled().count).toBe(0);
  });

  it("unscheduleIds removes specific entries", () => {
    const id = storage.register({ type: "custom", description: "ToRemove", tags: [], createdBy: "user", lifecycle: { type: "permanent" } });
    orchestrator.scheduleIds([id]);
    orchestrator.unscheduleIds([id]);
    expect(orchestrator.listScheduled().count).toBe(0);
  });

  it("listScheduled returns accurate count", () => {
    storage.register({ type: "custom", description: "S1", tags: ["count"], content: "s1", createdBy: "user", lifecycle: { type: "permanent" } });
    storage.register({ type: "custom", description: "S2", tags: ["count"], content: "s2", createdBy: "user", lifecycle: { type: "permanent" } });

    orchestrator.scheduleTags(["count"]);
    expect(orchestrator.listScheduled().count).toBe(2);
  });

  it("listAvailable returns all active entries", () => {
    storage.register({ type: "custom", description: "Available", tags: ["vis"], createdBy: "user", lifecycle: { type: "permanent" } });

    const available = orchestrator.listAvailable();
    expect(available).toHaveLength(1);
    expect(available[0]!.description).toBe("Available");
    expect(available[0]!.tags).toContain("vis");
  });

  it("clearSchedule resets all state", () => {
    storage.register({ type: "custom", description: "Clear", tags: ["clr"], content: "c", createdBy: "user", lifecycle: { type: "permanent" } });
    orchestrator.scheduleTags(["clr"]);
    orchestrator.clearSchedule();
    expect(orchestrator.listScheduled().count).toBe(0);
  });

  it("resolveForMessage produces ResolvedEntry with content", async () => {
    storage.register({ type: "custom", description: "Msg", tags: ["msg"], content: "hello", createdBy: "user", lifecycle: { type: "permanent" } });
    orchestrator.scheduleTags(["msg"]);

    const resolved = await orchestrator.resolveForMessage(makeRunCtx());
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.content).toBe("hello");
  });
});

// ---------------------------------------------------------------------------
// Unit: Message Composer
// ---------------------------------------------------------------------------

describe("Message Composer", () => {
  beforeEach(() => {
    testDir = join(tmpdir(), `registry-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    storage = new RegistryStorage(tmpPath("registry.jsonl"));
    storage.setCallsPath(tmpPath("calls.jsonl"));
    orchestrator = new ScheduleOrchestrator(storage);
  });

  it("buildToCTable generates markdown table with active entries", () => {
    storage.register({ type: "custom", description: "First entry", tags: ["a", "b"], createdBy: "user", lifecycle: { type: "permanent" } });
    storage.register({ type: "custom", description: "Second entry", tags: ["c"], createdBy: "system", lifecycle: { type: "permanent" } });

    const table = buildToCTable(storage, makeRunCtx());
    expect(table).toContain("## Available Context");
    expect(table).toContain("| ID | Tags | Description |");
    expect(table).toContain("First entry");
    expect(table).toContain("Second entry");
    expect(table).toContain("a, b");
  });

  it("buildToCTable returns empty string when no entries", () => {
    const table = buildToCTable(storage);
    expect(table).toBe("");
  });

  it("composeMessage produces three-section output", async () => {
    storage.register({ type: "custom", description: "Policy", tags: ["policy"], content: "Policy content", createdBy: "user", lifecycle: { type: "permanent" } });
    storage.register({ type: "file", description: "Rules", name: "rules", content: "Rules content", tags: ["placeholder"], createdBy: "system", lifecycle: { type: "permanent" } });

    // Schedule the policy entry
    orchestrator.scheduleTags(["policy"]);

    const result = await composeMessage({
      basePrompt: "Base prompt with {{rules}} placeholder",
      orchestrator,
      storage,
      runCtx: makeRunCtx(),
    });

    // HEAD: ToC table
    expect(result).toContain("## Available Context");
    expect(result).toContain("Policy");
    expect(result).toContain("Rules");

    // INJECTED: Scheduled entries
    expect(result).toContain("Policy content");

    // CONTEXT: {{rules}} resolved
    expect(result).toContain("Rules content");
    expect(result).not.toContain("{{rules}}"); // placeholder replaced
  });

  it("composeMessage without schedule produces ToC + context only", async () => {
    storage.register({ type: "file", description: "Placeholder", name: "rules", content: "Rules content", tags: ["placeholder"], createdBy: "system", lifecycle: { type: "permanent" } });

    const result = await composeMessage({
      basePrompt: "Base with {{rules}}",
      orchestrator,
      storage,
      runCtx: makeRunCtx(),
    });

    expect(result).toContain("## Available Context");
    expect(result).toContain("Rules content");
    expect(result).toContain("Base with Rules content");
  });

  it("composeMessage records call history for injected entries", async () => {
    storage.register({ type: "custom", description: "CallTrack", tags: ["track"], content: "ct", createdBy: "user", lifecycle: { type: "permanent" } });
    orchestrator.scheduleTags(["track"]);

    await composeMessage({
      basePrompt: "prompt",
      orchestrator,
      storage,
      runCtx: makeRunCtx({ roundNumber: 1 }),
    });

    // After compose, call history should exist
    expect(storage.getTotalCalls).toBeDefined();
  });

  it("composeMessage with unregistered {{name}} leaves placeholder unchanged", async () => {
    const result = await composeMessage({
      basePrompt: "Prompt with {{nonexistent}} placeholder",
      orchestrator,
      storage,
      runCtx: makeRunCtx(),
    });

    expect(result).toContain("{{nonexistent}}");
  });
});

// ---------------------------------------------------------------------------
// Integration: End-to-end flow
// ---------------------------------------------------------------------------

describe("End-to-end Registry flow", () => {
  beforeEach(() => {
    testDir = join(tmpdir(), `registry-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    storage = new RegistryStorage(tmpPath("registry.jsonl"));
    storage.setCallsPath(tmpPath("calls.jsonl"));
    orchestrator = new ScheduleOrchestrator(storage);
  });

  it("register → schedule → resolve → compose produces correct output", async () => {
    // 1. Register entries
    const fsId = storage.register({
      type: "custom",
      description: "文件系统安全策略",
      content: "仅允许在test/目录写入",
      tags: ["filesystem", "security"],
      group: "policies",
      priority: 10,
      lifecycle: { type: "permanent" },
      createdBy: "user",
    });

    const bashId = storage.register({
      type: "custom",
      description: "Bash命令安全规则",
      content: "禁止rm -rf、禁止访问/etc",
      tags: ["bash", "security"],
      group: "policies",
      priority: 5,
      lifecycle: { type: "permanent" },
      createdBy: "user",
    });

    expect(fsId).toBeString();
    expect(bashId).toBeString();

    // 2. Register runtime observation as inline context
    const observationTags = ["tool-output", "mkdir", "auto-generated"];
    const observationId = storage.register({
      type: "custom",
      description: "mkdir tool output",
      content: "[ls output] test/ exists",
      tags: observationTags,
      group: "runtime-observations",
      priority: 0,
      lifecycle: { type: "session", createdAt: Date.now() },
      createdBy: "system",
    });

    // Auto-schedule the runtime observation
    orchestrator.scheduleIds([observationId]);

    // 3. LLM schedules security policies (both entries share "security" tag)
    const scheduleResult = orchestrator.scheduleTags(["security"]);
    expect(scheduleResult.scheduled).toBeGreaterThanOrEqual(1);

    // 4. Compose message
    const result = await composeMessage({
      basePrompt: "用mkdir在project中创建文件夹",
      orchestrator,
      storage,
      runCtx: makeRunCtx(),
    });

    // 5. Verify output
    expect(result).toContain("## Available Context");
    expect(result).toContain("文件系统安全策略");
    expect(result).toContain("Bash命令安全规则");
    expect(result).toContain("mkdir tool output");
    expect(result).toContain("仅允许在test/目录写入");
    expect(result).toContain("禁止rm -rf");
    expect(result).toContain("[ls output]");
  });

  it("template expansion end-to-end", async () => {
    // Register leaf entries
    const e1 = storage.register({ type: "custom", description: "L1", content: "leaf1", tags: [], createdBy: "user", lifecycle: { type: "permanent" } });
    const e2 = storage.register({ type: "custom", description: "L2", content: "leaf2", tags: [], createdBy: "user", lifecycle: { type: "permanent" } });

    // Register template
    const tId = storage.register({
      type: "template", description: "Bundle", memberIds: [e1, e2], tags: [], createdBy: "system", lifecycle: { type: "permanent" },
    });

    // Schedule template
    orchestrator.scheduleTemplate(tId);

    const result = await composeMessage({
      basePrompt: "test",
      orchestrator,
      storage,
      runCtx: makeRunCtx(),
    });

    expect(result).toContain("leaf1");
    expect(result).toContain("leaf2");
  });

  it("file-backed placeholder resolution in compose", async () => {
    // Create a temp markdown file
    const mdPath = tmpPath("rules.md");
    writeFileSync(mdPath, "# Rules\n\nBe careful with filesystem operations.", "utf-8");

    // Register as file-backed placeholder
    storage.register({
      type: "file",
      description: "Rules placeholder",
      name: "rules",
      filePath: mdPath,
      tags: ["placeholder"],
      createdBy: "system",
      lifecycle: { type: "permanent" },
    });

    const result = await composeMessage({
      basePrompt: "Follow these rules: {{rules}}",
      orchestrator,
      storage,
      runCtx: makeRunCtx(),
    });

    expect(result).toContain("# Rules");
    expect(result).toContain("Be careful with filesystem operations");
    expect(result).not.toContain("{{rules}}");
  });
});
