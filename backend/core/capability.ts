/**
 * better-subagent -- CapabilityRegistry
 *
 * Pure data structure that manages capability definitions and their implication
 * hierarchy.  No I/O, no side effects.
 *
 * # Purpose
 *
 * The pipeline's COLLECT step uses this registry to:
 *   1. Resolve capability names from ContextRequest.want.capabilities.
 *   2. Expand implies chains recursively (a -> b -> c yields [a, b, c]).
 *   3. Look up defaultEntryIds to find which entries satisfy each capability.
 *
 * # Separation of concerns
 *
 * - `Capability`     : *definition* metadata (name, description, implies,
 *                       default entry IDs).
 * - `Registry`       : *entry* storage (holds full Entry objects, indexes by
 *                       capability name via its own capabilityIndex).
 * - `CapabilityRegistry` : manages capability *definitions* and the implies
 *                       DAG.  It tells the pipeline *which entries to look for*;
 *                       the entry Registry holds the actual entries.
 *
 * @module
 */

import type { Capability } from "./types.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Regex for validating capability names.
 *
 * - Lowercase alphanumeric characters and hyphens only.
 * - Must start and end with an alphanumeric character.
 * - No consecutive hyphens.
 * - Minimum length 1.
 */
const NAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

// ---------------------------------------------------------------------------
// Exported errors
// ---------------------------------------------------------------------------

/**
 * Thrown when `declare()` receives a capability whose name does not match the
 * required format.
 */
export class InvalidCapabilityNameError extends Error {
  constructor(name: string) {
    super(
      `Invalid capability name "${name}". `
        + "Names must match /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/. "
        + "E.g. \"code-review\", \"fs-read\".",
    );
    this.name = "InvalidCapabilityNameError";
  }
}

/**
 * Thrown when `declare()` references implied capabilities that have not been
 * declared.
 */
export class MissingImpliedCapabilityError extends Error {
  constructor(name: string, missing: string[]) {
    super(
      `Capability "${name}" implies [${missing.map((m) => `"${m}"`).join(", ")}] `
        + "but these capabilities have not been declared.",
    );
    this.name = "MissingImpliedCapabilityError";
  }
}

/**
 * Thrown when `expand()` detects a circular implication chain.
 */
export class CircularImpliesError extends Error {
  /** The cycle path, starting and ending at the same node. */
  readonly path: string[];

  constructor(path: string[]) {
    super(
      `Circular implies chain detected: ${path.join(" -> ")}`,
    );
    this.name = "CircularImpliesError";
    this.path = path;
  }
}

// ---------------------------------------------------------------------------
// CapabilityRegistry
// ---------------------------------------------------------------------------

/**
 * Registry for capability definitions and their implication DAG.
 *
 * Capabilities form a simple subsumption hierarchy: if capability A implies B,
 * requesting A also satisfies B.  Chains are resolved recursively by
 * `expand()`.
 *
 * # Thread-safety
 *
 * This class is not thread-safe.  Callers in concurrent environments must
 * provide their own synchronisation.
 */
export class CapabilityRegistry {
  /** name -> Capability definition. */
  private readonly caps = new Map<string, Capability>();

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------

  constructor() {
    // All state initialised inline above.
  }

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------

  /**
   * Register a capability definition.
   *
   * - Validates the name against the allowed format (lowercase alphanumeric
   *   and hyphens, no leading/trailing hyphens, no consecutive hyphens).
   * - If a capability with the same name already exists it is **overwritten**
   *   (updated in place).
   * - All entries in `capability.implies` **must** already be declared.
   *   Forward references are not allowed — declare dependencies first.
   * - The `implies` array and `defaultEntryIds` array are shallow-copied on
   *   write so that external mutations after declare() do not affect the
   *   registry.
   *
   * @param capability - The capability definition to register.
   * @throws {InvalidCapabilityNameError}  If the name format is invalid.
   * @throws {MissingImpliedCapabilityError}  If any implied capability has
   *   not been declared.
   */
  declare(capability: Capability): void {
    const { name } = capability;

    // -- Name format --------------------------------------------------------
    if (!NAME_RE.test(name)) {
      throw new InvalidCapabilityNameError(name);
    }

    // -- Validate implies exist --------------------------------------------
    const implied = capability.implies;
    if (implied && implied.length > 0) {
      const missing = implied.filter((c) => !this.caps.has(c));
      if (missing.length > 0) {
        throw new MissingImpliedCapabilityError(name, missing);
      }
    }

    // -- Store (shallow copy to defend against external mutation) ----------
    this.caps.set(name, {
      name,
      description: capability.description,
      ...(implied && implied.length > 0
        ? { implies: [...implied] }
        : {}),
      ...(capability.defaultEntryIds
        ? { defaultEntryIds: [...capability.defaultEntryIds] }
        : {}),
    });
  }

  // -----------------------------------------------------------------------
  // Lookup
  // -----------------------------------------------------------------------

  /**
   * Retrieve a capability definition by name.
   *
   * @param name - The capability name.
   * @returns The `Capability` if found, `undefined` otherwise.
   */
  get(name: string): Capability | undefined {
    return this.caps.get(name);
  }

  /**
   * Check whether a capability name has been declared.
   *
   * @param name - The capability name.
   * @returns `true` if the capability exists.
   */
  has(name: string): boolean {
    return this.caps.has(name);
  }

  /**
   * List every registered capability definition.
   *
   * Each entry in the returned array is a shallow copy so callers cannot
   * mutate the registry's internal state.
   *
   * @returns A (possibly empty) array of `Capability` objects.
   */
  list(): Capability[] {
    return [...this.caps.values()].map((c) => ({
      name: c.name,
      description: c.description,
      ...(c.implies ? { implies: [...c.implies] } : {}),
      ...(c.defaultEntryIds ? { defaultEntryIds: [...c.defaultEntryIds] } : {}),
    }));
  }

  // -----------------------------------------------------------------------
  // Removal
  // -----------------------------------------------------------------------

  /**
   * Remove a capability definition from the registry.
   *
   * **Note**: This does not check whether other capabilities imply the
   * removed one.  Those capabilities will continue to list it in their
   * `implies` array, but `expand()` will treat missing capabilities as
   * absent (they simply will not appear in the expanded result).  Callers
   * that want a consistent DAG should audit implications after removal.
   *
   * @param name - The capability name to remove.
   * @returns `true` if the capability existed and was removed, `false`
   *   otherwise.
   */
  remove(name: string): boolean {
    return this.caps.delete(name);
  }

  // -----------------------------------------------------------------------
  // Implies expansion
  // -----------------------------------------------------------------------

  /**
   * Recursively expand a list of capability names through the `implies`
   * DAG, returning every capability that is transitively satisfied.
   *
   * The result is ordered so that a capability always appears before the
   * capabilities it implies (topological-like order).  Duplicates are
   * suppressed: if multiple paths reach the same capability, it is included
   * only once, at its first occurrence.
   *
   * ## Example
   *
   * ```
   * A implies [B, C]
   * B implies [D]
   * C implies [D]
   *
   * expand(["A"]) → ["A", "B", "C", "D"]
   * ```
   *
   * ## Cycle detection
   *
   * If the implication graph contains a cycle reachable from the given
   * names, a `CircularImpliesError` is thrown with the specific path.
   *
   * @param names - Seed capability names.
   * @returns All capability names transitively satisfied, including the
   *   seeds.  Order: seeds first (preserving input order), then implied
   *   capabilities in traversal order (breadth-first within each seed).
   * @throws {CircularImpliesError}  If a cycle is detected.
   */
  expand(names: string[]): string[] {
    const result: string[] = [];
    const seen = new Set<string>();
    const visiting = new Set<string>();

    const visit = (name: string, path: string[]): void => {
      if (visiting.has(name)) {
        // Cycle detected -- find where it started in the current path.
        const cycleStart = path.indexOf(name);
        const cycle = cycleStart >= 0
          ? [...path.slice(cycleStart), name]
          : [...path, name];
        throw new CircularImpliesError(cycle);
      }

      if (seen.has(name)) return;
      seen.add(name);

      const cap = this.caps.get(name);
      if (!cap) return; // undefined capabilities are silently skipped.

      result.push(name);
      visiting.add(name);

      const implied = cap.implies;
      if (implied) {
        for (const child of implied) {
          visit(child, [...path, name]);
        }
      }

      visiting.delete(name);
    };

    for (const name of names) {
      visit(name, []);
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // Default entries
  // -----------------------------------------------------------------------

  /**
   * Return the `defaultEntryIds` for the given capability.
   *
   * These are entry IDs that the pipeline should attempt to mount when this
   * capability is requested, before looking at entries that merely declare
   * the capability via their own `capabilities` field.
   *
   * @param name - The capability name.
   * @returns The list of default entry IDs (may be empty).
   */
  getDefaultEntries(name: string): string[] {
    const cap = this.caps.get(name);
    return cap?.defaultEntryIds
      ? [...cap.defaultEntryIds]
      : [];
  }
}
