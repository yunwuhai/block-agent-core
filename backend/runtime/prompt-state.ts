/**
 * Prompt State — 占位符绑定、事件日志和槽位持久化
 *
 * 从旧的 computation/prompt/engine.ts 提取的最小模块。
 * 仅包含被新系统（RunLifecycle）使用的功能。
 *
 * 功能:
 *   registerPlaceholder(name, filePath) — 将 {{name}} 绑定到 markdown 文件
 *   getEventLog()                       — 返回操作变更日志
 *   serializeSlots() / deserializeSlots() — 多轮延续的状态持久化
 *   reset()                             — 清除所有状态（主要用于测试）
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// 路径解析
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLUGIN_DIR = resolve(__dirname, "..", "..");

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

interface SlotEntry {
  content: string;
  priority: number;
  consumes: number;
  ttl?: number;
  createdAt: number;
}

interface PlaceholderEntry {
  filePath: string;
}

export interface PromptSlotChange {
  readonly operation: "set" | "clear" | "push" | "pop" | "consume" | "register_placeholder" | "unregister_placeholder";
  readonly slotName: string;
  readonly content?: string;
  readonly priority?: number;
}

// ---------------------------------------------------------------------------
// 状态（模块级可变变量）
// ---------------------------------------------------------------------------

const slots = new Map<string, SlotEntry>();
const stacks = new Map<string, { entries: SlotEntry[] }>();
const placeholders = new Map<string, PlaceholderEntry>();
const eventLog: PromptSlotChange[] = [];

// ---------------------------------------------------------------------------
// 占位符 API
// ---------------------------------------------------------------------------

/**
 * 注册占位符绑定: 将 {{name}} 映射到文件路径。
 * 在 compose 时，{{name}} 会被替换为文件内容。
 */
export function registerPlaceholder(name: string, filePath: string): void {
  const resolvedPath = resolve(PLUGIN_DIR, filePath);
  placeholders.set(name, { filePath: resolvedPath });
  eventLog.push({ operation: "register_placeholder", slotName: name, content: resolvedPath });
}

export function unregisterPlaceholder(name: string): boolean {
  const existed = placeholders.delete(name);
  if (existed) {
    eventLog.push({ operation: "unregister_placeholder", slotName: name });
  }
  return existed;
}

export function listPlaceholders(): ReadonlyMap<string, { filePath: string }> {
  return new Map(placeholders);
}

/**
 * 获取操作事件日志。被 run.ts 用于记录槽位变化。
 */
export function getEventLog(): readonly PromptSlotChange[] {
  return eventLog;
}

/**
 * 清除所有状态（用于测试和重置）。
 */
export function reset(): void {
  slots.clear();
  stacks.clear();
  placeholders.clear();
  eventLog.length = 0;
}

// ---------------------------------------------------------------------------
// 槽位持久化 — 多轮延续的序列化/反序列化
// ---------------------------------------------------------------------------

export interface SerializedSlots {
  readonly slots: Readonly<Record<string, SlotEntry>>;
  readonly stacks: Readonly<Record<string, readonly SlotEntry[]>>;
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
