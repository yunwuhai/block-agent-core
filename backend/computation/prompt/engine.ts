/**
 * Dynamic Prompt Slot Engine
 * 
 * Lifecycle:
 *   setSlot(name, content, priority, consumes, ttlMs) — creates/overwrites a slot
 *   setOnceSlot(name, content, priority, ttlMs) — one-time-use slot (consumes=1)
 *   renderPrompt(base, consume) — renders all active slots prepended to base prompt;
 *     automatically expires stale slots (past TTL) and consumes one-shot slots
 *   clearSlot(name) — removes a specific slot
 *   clearHookSlots() — removes all hook-injected slots (names starting with "hook_")
 *   expireStaleSlots() — removes all slots past their TTL
 *   reset() — removes ALL slots and event log (called at start of each run)
 * 
 * Slot priority: higher = rendered first. Same-priority slots maintain insertion order.
 * TTL: optional milliseconds-from-now duration. Slot auto-expires after TTL elapses.
 * Consumes: -1 = persistent, 0 = consumed (removed at next render), 1+ = one-shot.
 */

interface SlotEntry {
  content: string;
  priority: number;
  consumes: number;  // -1 = persistent, 0+ = remaining uses
  ttl?: number;       // Unix timestamp (ms) after which the slot expires
  createdAt: number;  // Unix timestamp (ms) when slot was created
}

interface StackSlot {
  entries: SlotEntry[];
}

export interface PromptSlotChange {
  readonly operation: "set" | "clear" | "push" | "pop" | "consume";
  readonly slotName: string;
  readonly content?: string;
  readonly priority?: number;
}

const slots = new Map<string, SlotEntry>();
const stacks = new Map<string, StackSlot>();
const eventLog: PromptSlotChange[] = [];

export function setSlot(name: string, content: string, priority = 0, consumes?: number, ttlMs?: number): void {
  slots.set(name, { 
    content, 
    priority, 
    consumes: consumes ?? -1, 
    ...(ttlMs !== undefined ? { ttl: Date.now() + ttlMs } : {}),
    createdAt: Date.now(),
  });
  eventLog.push({ operation: "set", slotName: name, content, priority });
}

export function clearSlot(name: string): void {
  slots.delete(name);
  stacks.delete(name);
  eventLog.push({ operation: "clear", slotName: name });
}

export function pushSlot(name: string, content: string, priority = 0): void {
  let stack = stacks.get(name);
  if (!stack) {
    stack = { entries: [] };
    stacks.set(name, stack);
  }
  stack.entries.push({ content, priority, consumes: -1, createdAt: Date.now() });
  eventLog.push({ operation: "push", slotName: name, content, priority });
}

export function popSlot(name: string): string | undefined {
  const stack = stacks.get(name);
  if (!stack || stack.entries.length === 0) return undefined;
  const popped = stack.entries.pop()!;
  eventLog.push({ operation: "pop", slotName: name });
  return popped.content;
}

export function setOnceSlot(name: string, content: string, priority = 0, ttlMs?: number): void {
  setSlot(name, content, priority, 1, ttlMs);
}

export function listSlots(): ReadonlyMap<string, SlotEntry> {
  return new Map(slots);
}

export function listStacks(): ReadonlyMap<string, StackSlot> {
  return new Map(stacks);
}

export function expireStaleSlots(): string[] {
  const now = Date.now();
  const expired: string[] = [];
  for (const [name, entry] of slots) {
    if (entry.ttl !== undefined && now >= entry.ttl) {
      slots.delete(name);
      stacks.delete(name);
      expired.push(name);
      eventLog.push({ operation: "clear", slotName: name });
    }
  }
  return expired;
}

export function clearHookSlots(): void {
  for (const name of slots.keys()) {
    if (name.startsWith("hook_")) {
      slots.delete(name);
      stacks.delete(name);
      eventLog.push({ operation: "clear", slotName: name });
    }
  }
}

export function renderPrompt(base: string, consume = true): string {
  expireStaleSlots();  // Clean up expired slots first

  const entries: Array<{ content: string; priority: number }> = [];
  const consumed: string[] = [];

  for (const [name, entry] of slots) {
    if (entry.consumes > 0) {
      if (consume) {
        entry.consumes--;
        if (entry.consumes === 0) {
          consumed.push(name);
        }
      }
    }
    entries.push({ content: entry.content, priority: entry.priority });
  }

  if (consume) {
    for (const name of consumed) {
      slots.delete(name);
    }
  }

  for (const [, stack] of stacks) {
    for (const entry of stack.entries) {
      entries.push({ content: entry.content, priority: entry.priority });
    }
  }

  entries.sort((a, b) => b.priority - a.priority);
  const slotLines = entries.map((e) => e.content).join("\n\n");
  return slotLines ? `${slotLines}\n\n${base}` : base;
}

export function getEventLog(): readonly PromptSlotChange[] {
  return eventLog;
}

export function reset(): void {
  slots.clear();
  stacks.clear();
  eventLog.length = 0;
}
