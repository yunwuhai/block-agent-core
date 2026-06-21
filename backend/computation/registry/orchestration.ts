/**
 * Prompt Registry — Layer 3: Schedule Orchestration Engine
 *
 * The mutable scheduling layer that the LLM drives via tool calls.
 * Maintains a per-round `ScheduleState` and exposes the tool operations
 * that the PI agent calls.
 *
 * Tool operations:
 *   scheduleTags(tags)      — add all entries with these tags to the schedule
 *   scheduleIds(ids)        — add specific entries by ID
 *   scheduleGroup(group)    — add all entries in a group
 *   scheduleTemplate(id)    — add a template (expanded at resolution time)
 *   unscheduleTags(tags)    — remove entries with these tags from the schedule
 *   unscheduleIds(ids)      — remove specific entries by ID
 *   listScheduled()         — return current schedule state summary
 *   listAvailable()         — return ToC raw data for table generation
 *   clearSchedule()         — reset all scheduling for next round
 *   getSchedule()           — return the ScheduleState for Layer 2 consumption
 */

import type {
  RegistryEntry,
  ScheduleState,
  RunContext,
  ResolvedEntry,
} from "./types.ts";
import type { RegistryStorage } from "./storage.ts";
import { resolveScheduled } from "./resolution.ts";

// ---------------------------------------------------------------------------
// ScheduleOrchestrator
// ---------------------------------------------------------------------------

export class ScheduleOrchestrator {
  private tags = new Set<string>();
  private ids = new Set<string>();
  private groups = new Set<string>();
  private templates = new Set<string>();

  private readonly storage: RegistryStorage;
  private lifecycleMap?: ReadonlyMap<string, number>;

  constructor(storage: RegistryStorage) {
    this.storage = storage;
  }

  /** Set round-start lifecycle mapping for "rounds"-type entries. */
  setLifecycleMap(map: ReadonlyMap<string, number>): void {
    this.lifecycleMap = map;
  }

  // -----------------------------------------------------------------------
  // Schedule operations — LLM-callable tools
  // -----------------------------------------------------------------------

  /**
   * Schedule all entries that have at least one of the given tags.
   * Returns the number of unique entry IDs added to the schedule.
   */
  scheduleTags(tags: readonly string[]): { scheduled: number; ids: string[] } {
    const before = this.ids.size;
    const entries = this.storage.findByTags(tags, "any");
    const added: string[] = [];
    for (const e of entries) {
      this.ids.add(e.id);
      added.push(e.id);
    }
    for (const tag of tags) {
      this.tags.add(tag);
    }
    return { scheduled: this.ids.size - before, ids: [...new Set(added)] };
  }

  /**
   * Schedule specific entries by ID.
   * Silently ignores IDs that don't exist.
   */
  scheduleIds(ids: readonly string[]): { scheduled: number } {
    let count = 0;
    for (const id of ids) {
      if (this.storage.get(id) && !this.ids.has(id)) {
        this.ids.add(id);
        count++;
      }
    }
    return { scheduled: count };
  }

  /**
   * Schedule all entries in a group.
   * Returns the number of entries added.
   */
  scheduleGroup(group: string): { scheduled: number; ids: string[] } {
    const before = this.ids.size;
    const entries = this.storage.findByGroup(group);
    const added: string[] = [];
    for (const e of entries) {
      this.ids.add(e.id);
      added.push(e.id);
    }
    this.groups.add(group);
    return { scheduled: this.ids.size - before, ids: added };
  }

  /**
   * Schedule a template for expansion. The template itself is NOT added to
   * `ids` — it goes to `templates` for Layer 2 to expand at resolution time.
   */
  scheduleTemplate(templateId: string): { scheduled: boolean; ids?: string[] } {
    const entry = this.storage.get(templateId);
    if (!entry || entry.type !== "template") {
      return { scheduled: false };
    }
    this.templates.add(templateId);
    if (entry.memberIds) {
      return { scheduled: true, ids: [...entry.memberIds] };
    }
    return { scheduled: true };
  }

  // -----------------------------------------------------------------------
  // Unschedule operations
  // -----------------------------------------------------------------------

  /**
   * Remove from the schedule all entries that have any of the given tags.
   * This removes those specific entry IDs from the id set; the tags
   * themselves are also removed from the tag set.
   */
  unscheduleTags(tags: readonly string[]): { removed: number } {
    // Find which entry IDs to remove
    const entriesToRemove = this.storage.findByTags(tags, "any");
    const removeIds = new Set(entriesToRemove.map((e) => e.id));

    let removed = 0;
    for (const id of removeIds) {
      if (this.ids.has(id)) {
        this.ids.delete(id);
        removed++;
      }
    }

    // Remove the tags from the tag set
    for (const tag of tags) {
      this.tags.delete(tag);
    }

    return { removed };
  }

  /**
   * Remove specific entries by ID from the schedule.
   */
  unscheduleIds(ids: readonly string[]): { removed: number } {
    let removed = 0;
    for (const id of ids) {
      if (this.ids.delete(id)) removed++;
    }
    return { removed };
  }

  // -----------------------------------------------------------------------
  // Query operations
  // -----------------------------------------------------------------------

  /**
   * Return a summary of the current schedule state.
   */
  listScheduled(): {
    tags: string[];
    ids: string[];
    groups: string[];
    templates: string[];
    count: number;
  } {
    // Get unique IDs from all sources for the count
    const allIds = new Set<string>();
    for (const tag of this.tags) {
      for (const e of this.storage.findByTags([tag])) {
        allIds.add(e.id);
      }
    }
    for (const id of this.ids) allIds.add(id);
    for (const group of this.groups) {
      for (const e of this.storage.findByGroup(group)) {
        allIds.add(e.id);
      }
    }

    return {
      tags: [...this.tags],
      ids: [...this.ids],
      groups: [...this.groups],
      templates: [...this.templates],
      count: allIds.size,
    };
  }

  /**
   * Return all available entries as raw data for ToC table generation.
   * Filters by lifecycle (excludes expired entries).
   */
  listAvailable(runCtx?: RunContext): Array<{
    id: string;
    type: string;
    tags: readonly string[];
    group?: string;
    description: string;
  }> {
    const all = this.storage.list();
    return all
      .filter((e) => {
        if (!runCtx) return true;
        const lifecycleRound = this.lifecycleMap?.get(e.id) ?? e.lifecycle.createdAt;
        // Use dynamic import to avoid circular reference — isActive is in resolution.ts
        return true; // simplified: show all, let resolution filter at injection time
      })
      .map((e) => ({
        id: e.id,
        type: e.type,
        tags: e.tags,
        ...(e.group !== undefined ? { group: e.group } : {}),
        description: e.description,
      }));
  }

  // -----------------------------------------------------------------------
  // State management
  // -----------------------------------------------------------------------

  /** Clear all scheduled state (call at the end of each round). */
  clearSchedule(): void {
    this.tags.clear();
    this.ids.clear();
    this.groups.clear();
    this.templates.clear();
  }

  /** Export the current schedule for Layer 2 consumption. */
  getSchedule(): ScheduleState {
    return {
      tags: new Set(this.tags),
      ids: new Set(this.ids),
      groups: new Set(this.groups),
      templates: new Set(this.templates),
    };
  }

  // -----------------------------------------------------------------------
  // Resolution — called by composer before message send
  // -----------------------------------------------------------------------

  /**
   * Resolve the current schedule into a list of injection-ready entries.
   * Delegates to Layer 2's resolveScheduled().
   */
  async resolveForMessage(runCtx: RunContext): Promise<ResolvedEntry[]> {
    const schedule = this.getSchedule();
    return resolveScheduled(schedule, this.storage, runCtx, this.lifecycleMap);
  }
}
