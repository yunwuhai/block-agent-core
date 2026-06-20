interface SlotEntry {
  content: string;
  priority: number;
  ttl?: number;
  consumes: number;
}

interface StackSlot {
  entries: SlotEntry[];
}

export interface PromptSlotChange {
  readonly operation: "set" | "clear" | "push" | "pop" | "consume";
  readonly slotName: string;
  readonly content?: string;
  readonly ttl?: number;
  readonly priority?: number;
}

const slots = new Map<string, SlotEntry>();
const stacks = new Map<string, StackSlot>();
const eventLog: PromptSlotChange[] = [];

export function setSlot(name: string, content: string, ttl?: number, priority = 0): void {
  slots.set(name, { content, priority, ttl, consumes: -1 });
  eventLog.push({ operation: "set", slotName: name, content, ttl, priority });
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
  stack.entries.push({ content, priority, ttl: undefined, consumes: -1 });
  eventLog.push({ operation: "push", slotName: name, content, priority });
}

export function popSlot(name: string): string | undefined {
  const stack = stacks.get(name);
  if (!stack || stack.entries.length === 0) return undefined;
  const popped = stack.entries.pop()!;
  eventLog.push({ operation: "pop", slotName: name });
  return popped.content;
}

export function setOnceSlot(name: string, content: string, priority = 0): void {
  slots.set(name, { content, priority, ttl: undefined, consumes: 1 });
  eventLog.push({ operation: "set", slotName: name, content, priority });
}

export function listSlots(): ReadonlyMap<string, SlotEntry> {
  return slots;
}

export function listStacks(): ReadonlyMap<string, StackSlot> {
  return stacks;
}

export function renderPrompt(base: string): string {
  const entries: Array<{ content: string; priority: number }> = [];
  const consumed: string[] = [];

  for (const [name, entry] of slots) {
    if (entry.consumes > 0) {
      entry.consumes--;
      if (entry.consumes === 0) {
        consumed.push(name);
      }
    }
    entries.push({ content: entry.content, priority: entry.priority });
  }

  for (const name of consumed) {
    slots.delete(name);
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

export function flushOnceAndExpired(): PromptSlotChange[] {
  const changes: PromptSlotChange[] = [];
  for (const [name, entry] of slots) {
    if (entry.consumes === 0) {
      slots.delete(name);
      changes.push({ operation: "consume", slotName: name });
    }
  }
  return changes;
}

export function getEventLog(): readonly PromptSlotChange[] {
  return eventLog;
}

export function reset(): void {
  slots.clear();
  stacks.clear();
  eventLog.length = 0;
}
