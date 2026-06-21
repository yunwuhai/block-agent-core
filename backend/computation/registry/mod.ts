/**
 * Prompt Registry — Barrel Export
 *
 * Three-layer architecture for LLM-driven prompt injection:
 *   Layer 1 (Storage)       — JSONL-backed entry store with in-memory indexes
 *   Layer 2 (Resolution)    — dedup, lifecycle, frequency, sort, load
 *   Layer 3 (Orchestration) — mutable schedule state, LLM-callable tools
 *   Composer                — message builder: ToC + injected + context
 */

// Types
export type {
  RegistryEntry,
  CallRecord,
  CallTrigger,
  ScheduleState,
  ResolvedEntry,
  RunContext,
  EntryType,
  LifecycleType,
  LifecycleConfig,
  FrequencyConfig,
  SlidingWindowState,
} from "./types.ts";

// Layer 1
export { RegistryStorage } from "./storage.ts";

// Layer 2
export {
  resolveScheduled,
  isActive,
  exceedsFrequency,
  expandTemplate,
} from "./resolution.ts";

// Layer 3
export { ScheduleOrchestrator } from "./orchestration.ts";

// Composer
export { composeMessage, buildToCTable } from "./composer.ts";
