/**
 * Dynamic Prompt Slot Engine
 * 
 * Three rendering systems (in migration):
 * 
 * 1. Prompt Registry (NEW) — full three-section message via composeMessage():
 *    HEAD (ToC table) + INJECTED (scheduled entries) + CONTEXT ({{name}} resolved).
 *    Backed by registry/ module (Layer 1→2→3→Composer). The preferred path.
 *    Access via setRegistry() + renderPromptWithRegistry().
 * 
 * 2. Placeholder replacement (LEGACY) — {{slot_name}} in prompt body is replaced
 *    with content from a registered markdown file at renderPrompt() time.
 *    registerPlaceholder(name, filePath) binds {{name}} → markdown content.
 *    When registry is active, also registers into the registry for unified lookup.
 * 
 * 3. Prepended slots (LEGACY) — setSlot() / pushSlot() content is prepended
 *    to the prompt, sorted by priority. Coexists with placeholder replacement.
 * 
 * Lifecycle:
 *   setRegistry(storage, orchestrator) — activate Registry-based rendering
 *   renderPromptWithRegistry(base, runCtx) — full three-section output
 *   registerPlaceholder(name, filePath) — binds {{name}} (also in registry if active)
 *   unregisterPlaceholder(name) — removes the binding
 *   setSlot(name, content, priority, consumes, ttlMs) — creates/overwrites a slot
 *   setOnceSlot(name, content, priority, ttlMs) — one-time-use slot (consumes=1)
 *   renderPrompt(base, consume) — (async) legacy: replaces {{name}} then prepends slots
 *   clearSlot(name) — removes a specific slot
 *   clearHookSlots() — removes all hook-injected slots
 *   reset() — removes ALL state (slots, stacks, placeholders, event log)
 */

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ScheduleOrchestrator } from "../registry/orchestration.ts";
import type { RegistryStorage } from "../registry/storage.ts";
import type { RunContext } from "../registry/types.ts";

// ---------------------------------------------------------------------------
// Path resolution — same approach as hooks/runner.ts
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLUGIN_DIR = resolve(__dirname, "..", "..", "..");

let registryStorage: RegistryStorage | null = null;
let registryOrchestrator: ScheduleOrchestrator | null = null;

/**
 * Activate Registry-based rendering. Once set, `renderPromptWithRegistry()`
 * produces the full three-section output (ToC + injected + context).
 * `registerPlaceholder()` will also register into the registry for unified
 * `{{name}}` resolution at compose time.
 */
export function setRegistry(
  storage: RegistryStorage,
  orchestrator: ScheduleOrchestrator,
): void {
  registryStorage = storage;
  registryOrchestrator = orchestrator;
}

/** Return the currently active registry storage (or null). */
export function getRegistry(): RegistryStorage | null {
  return registryStorage;
}

/** Return the currently active orchestrator (or null). */
export function getOrchestrator(): ScheduleOrchestrator | null {
  return registryOrchestrator;
}

/**
 * Render the final prompt via the Prompt Registry composer.
 *
 * Produces the full three-section message:
 *   1. HEAD     — ToC table (always present)
 *   2. INJECTED — full content of currently scheduled entries
 *   3. CONTEXT  — base prompt with `{{name}}` resolved from registry
 *
 * Falls back to legacy `renderPrompt()` if registry is not configured.
 *
 * @param base   — Raw prompt text with optional `{{name}}` placeholders.
 * @param runCtx — Current run context (roundNumber, runId, cwd).
 */
export async function renderPromptWithRegistry(
  base: string,
  runCtx?: RunContext,
): Promise<string> {
  if (!registryStorage || !registryOrchestrator) {
    return renderPrompt(base);
  }

  // Dynamic import to avoid circular dependency at module load time
  const { composeMessage } = await import("../registry/composer.ts");

  return composeMessage({
    basePrompt: base,
    orchestrator: registryOrchestrator,
    storage: registryStorage,
    runCtx,
  });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

interface PlaceholderEntry {
  filePath: string;  // absolute path to the bound markdown file
}

export interface PromptSlotChange {
  readonly operation: "set" | "clear" | "push" | "pop" | "consume" | "register_placeholder" | "unregister_placeholder";
  readonly slotName: string;
  readonly content?: string;
  readonly priority?: number;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const slots = new Map<string, SlotEntry>();
const stacks = new Map<string, StackSlot>();
const placeholders = new Map<string, PlaceholderEntry>();
const eventLog: PromptSlotChange[] = [];

// ---------------------------------------------------------------------------
// Placeholder API (NEW) — {{name}} → markdown file binding
// ---------------------------------------------------------------------------

/**
 * Register a placeholder binding: {{name}} in the prompt body will be
 * replaced by the content of the markdown file at `filePath` during
 * renderPrompt(). The file is read fresh on every renderPrompt() call.
 *
 * @param name - The placeholder name (without braces). Must match \w+.
 * @param filePath - Absolute or relative path to a markdown file.
 *   Relative paths are resolved against the project root (PLUGIN_DIR).
 */
export function registerPlaceholder(name: string, filePath: string): void {
  const resolvedPath = resolve(PLUGIN_DIR, filePath);
  placeholders.set(name, { filePath: resolvedPath });
  eventLog.push({ operation: "register_placeholder", slotName: name, content: resolvedPath });

  // Forward to Prompt Registry for unified {{name}} resolution
  if (registryStorage) {
    const existing = registryStorage.getByName(name);
    if (existing) {
      registryStorage.update(existing.id, { filePath: resolvedPath });
    } else {
      registryStorage.register({
        type: "file",
        description: `Placeholder {{${name}}}`,
        filePath: resolvedPath,
        name,
        tags: ["placeholder"],
        createdBy: "system",
        lifecycle: { type: "permanent" },
      });
    }
  }
}

/**
 * Remove a placeholder binding. {{name}} will no longer be replaced
 * during renderPrompt().
 *
 * @returns true if the placeholder existed and was removed, false otherwise.
 */
export function unregisterPlaceholder(name: string): boolean {
  const existed = placeholders.delete(name);
  if (existed) {
    eventLog.push({ operation: "unregister_placeholder", slotName: name });
  }
  return existed;
}

/**
 * List all registered placeholder bindings.
 */
export function listPlaceholders(): ReadonlyMap<string, PlaceholderEntry> {
  return new Map(placeholders);
}

// ---------------------------------------------------------------------------
// Traditional slot API (LEGACY)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// renderPrompt — placeholder substitution + traditional slot prepend
// ---------------------------------------------------------------------------

/**
 * Regex: matches {{word_chars}} — standard Handlebars/Mustache-style
 * placeholder pattern. Only word characters (\w) are valid placeholder names.
 */
const PLACEHOLDER_RE = /\{\{([\w-]+)\}\}/g;

/**
 * Render the final prompt by:
 * 1. Replacing all {{name}} placeholders in `base` with their bound markdown
 *    file content (reading fresh from disk each call).
 * 2. Prepending all active traditional slots (sorted by priority) to the result.
 *
 * Unregistered {{name}} patterns are left as-is in the output.
 * Missing/unreadable placeholder files emit a console.warn and leave
 * the placeholder text unchanged — no exception is thrown.
 *
 * @param base - The raw prompt text (with optional {{name}} placeholders).
 * @param consume - Whether to consume one-shot slots (default: true).
 * @returns The fully rendered prompt string.
 */
export async function renderPrompt(base: string, consume = true): Promise<string> {
  // -- Phase 1: Placeholder substitution --
  let resolved = base;
  const matches = base.matchAll(PLACEHOLDER_RE);
  // Reverse-iterate replacements so offsets stay valid
  const replacements: Array<{ index: number; length: number; name: string; content: string }> = [];

  for (const match of matches) {
    const name = match[1]!;
    const entry = placeholders.get(name);
    if (!entry) continue; // unregistered — keep as-is

    try {
      const fileContent = await readFile(entry.filePath, "utf-8");
      replacements.push({
        index: match.index!,
        length: match[0].length,
        name,
        content: fileContent,
      });
    } catch (err: unknown) {
      console.warn(
        `[efficiency-subagent slots] Cannot read placeholder "${name}" file "${entry.filePath}":`,
        err instanceof Error ? err.message : String(err),
      );
      // Keep the {{name}} placeholder in the output
    }
  }

  // Apply replacements in reverse order so indices don't shift
  replacements.sort((a, b) => b.index - a.index);
  for (const r of replacements) {
    resolved = resolved.slice(0, r.index) + r.content + resolved.slice(r.index + r.length);
  }

  // -- Phase 2: Traditional slot prepend --
  expireStaleSlots();

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
  return slotLines ? `${slotLines}\n\n${resolved}` : resolved;
}

export function getEventLog(): readonly PromptSlotChange[] {
  return eventLog;
}

export function reset(): void {
  slots.clear();
  stacks.clear();
  placeholders.clear();
  eventLog.length = 0;
}

// ---------------------------------------------------------------------------
// Slot persistence — serialize/deserialize for multi-turn continuation
// ---------------------------------------------------------------------------

export interface SerializedSlots {
  readonly slots: Readonly<Record<string, SlotEntry>>;
  readonly stacks: Readonly<Record<string, readonly SlotEntry[]>>;
  /** name → absolute filePath mapping for registered placeholders */
  readonly placeholders: Readonly<Record<string, string>>;
}

export function serializeSlots(): SerializedSlots {
  const slotObj: Record<string, SlotEntry> = {};
  for (const [name, entry] of slots) {
    slotObj[name] = entry;
  }
  const stackObj: Record<string, readonly SlotEntry[]> = {};
  for (const [name, stack] of stacks) {
    stackObj[name] = stack.entries;
  }
  const placeholderObj: Record<string, string> = {};
  for (const [name, entry] of placeholders) {
    placeholderObj[name] = entry.filePath;
  }
  return { slots: slotObj, stacks: stackObj, placeholders: placeholderObj };
}

export function deserializeSlots(data: SerializedSlots): void {
  slots.clear();
  stacks.clear();
  placeholders.clear();
  for (const [name, entry] of Object.entries(data.slots)) {
    slots.set(name, entry);
  }
  for (const [name, entries] of Object.entries(data.stacks)) {
    stacks.set(name, { entries: [...entries] });
  }
  if (data.placeholders) {
    for (const [name, filePath] of Object.entries(data.placeholders)) {
      placeholders.set(name, { filePath });
    }
  }
}
