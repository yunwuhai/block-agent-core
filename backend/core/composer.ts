/**
 * better-subagent -- Prompt Composer
 *
 * =============================================================================
 * PURE FUNCTION.  No I/O.  No side effects.  Deterministic.
 *
 * Transforms ContextAssembly + basePrompt -> FinalPrompt
 *
 * Produces three prompt sections:
 *   1. toc       -- Table of contents from pool entries (discovery)
 *   2. injected  -- Full content of mounted entries (context injection)
 *   3. context   -- basePrompt with {{name}} placeholders resolved
 *
 * Example output (abridged):
 *
 *   // === SECTION: toc ===
 *   📋 Available Context (3 entries)
 *   | Name | Description | Capabilities | Est. Tokens | Tags |
 *   |------|-------------|--------------|-------------|------|
 *   | fs-policy | Filesystem access rules | fs-read, fs-write | 120 | security |
 *   | review-guide | Code review checklist | code-review | 300 | dev |
 *
 *   // === SECTION: injected ===
 *   // === fs-policy (pinned) ===
 *   // Capabilities: fs-read, fs-write
 *   // Est. 120 tokens
 *
 *   You may read and write files under /home/project/src/ and /home/project/tests/.
 *   ...
 *   ---
 *
 *   // === SECTION: context ===
 *   You are a code reviewer. Follow the guidelines in {{review-guide}}.
 *   ...
 * =============================================================================
 */

import type {
  ContextAssembly,
  FinalPrompt,
  PromptSection,
  MountedEntry,
  PoolEntry,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Matches `{{name}}` placeholders in the base prompt. */
const PLACEHOLDER_RE = /\{\{([\w-]+)\}\}/g;

// ---------------------------------------------------------------------------
// Section 1  —  Table of Contents (ToC)
// ---------------------------------------------------------------------------

/**
 * Build the ToC section from pool entries.
 *
 * Shows a markdown table with Name, Description, Capabilities, estimated
 * tokens, and Tags so the LLM can discover and reference available entries
 * in subsequent scheduling requests.
 *
 * @param pool  All entries available but not mounted (metadata only).
 * @returns A PromptSection with role "toc".
 */
function buildTocSection(pool: readonly PoolEntry[]): PromptSection {
  let content: string;

  if (pool.length === 0) {
    content = "📋 Available Context: (no additional entries available)";
  } else {
    const header =
      `📋 Available Context (${pool.length} entries)\n` +
      `| Name | Description | Capabilities | Est. Tokens | Tags |\n` +
      `|------|-------------|--------------|-------------|------|`;

    const rows = pool.map((p) => {
      const e = p.entry;
      const caps = e.capabilities.length > 0 ? e.capabilities.join(", ") : "—";
      const tags = e.tags.length > 0 ? e.tags.join(", ") : "—";
      return `| ${e.name} | ${e.description} | ${caps} | ${e.estimatedTokens} | ${tags} |`;
    });

    content = header + "\n" + rows.join("\n");
  }

  return { role: "toc", content };
}

// ---------------------------------------------------------------------------
// Section 2  —  Injected Content
// ---------------------------------------------------------------------------

/**
 * Build the injected-content section from mounted entries.
 *
 * Each entry is rendered as a code-comment header block followed by the
 * entry's raw content and a trailing `---` separator.
 *
 * Ordering:
 *   1. Pinned entries (reason === "pinned") appear first.
 *   2. Remaining entries are sorted by priority descending.
 *
 * @param mounted  Entries that passed the pipeline and are included.
 * @returns A PromptSection with role "injected".
 */
function buildInjectedSection(mounted: readonly MountedEntry[]): PromptSection {
  let content: string;

  if (mounted.length === 0) {
    content = "(no context entries injected for this run)";
  } else {
    // 1. Pinned entries first, then by priority descending.
    //    Stable: entries with same priority retain their array order.
    const sorted = [...mounted].sort((a, b) => {
      const aPinned = a.reason === "pinned" ? 0 : 1;
      const bPinned = b.reason === "pinned" ? 0 : 1;
      if (aPinned !== bPinned) return aPinned - bPinned;
      return b.entry.priority - a.entry.priority;
    });

    const parts = sorted.map((m) => {
      const caps =
        m.entry.capabilities.length > 0
          ? m.entry.capabilities.join(", ")
          : "—";
      return (
        `// === ${m.entry.name} (${m.reason}) ===\n` +
        `// Capabilities: ${caps}\n` +
        `// Est. ${m.tokens} tokens\n` +
        `\n` +
        `${m.entry.content}\n` +
        `\n---`
      );
    });

    content = parts.join("\n\n");
  }

  return { role: "injected", content };
}

// ---------------------------------------------------------------------------
// Section 3  —  Context (placeholder resolution)
// ---------------------------------------------------------------------------

/**
 * Resolve `{{name}}` placeholders in the base prompt.
 *
 * Resolution algorithm (per placeholder):
 *
 *   1. Look up `name` in the mounted entries by `entry.name`.
 *      - Found     -> replace `{{name}}` with `entry.content`.
 *      - Not found -> go to step 2.
 *
 *   2. Look up `name` in the pool entries by `entry.name`.
 *      - Found     -> leave `{{name}}` unchanged and append an availability
 *                     hint after the prompt body.
 *      - Not found -> replace `{{name}}` with a diagnostic marker
 *                     `[entry not mounted: name]`.
 *
 * Availability hints are collected and appended as a single block after
 * the resolved prompt text.
 *
 * @param basePrompt  The raw prompt string with optional `{{name}}` markers.
 * @param mounted     Entries currently mounted (content source).
 * @param pool        Entries available but not mounted (discovery hints).
 * @returns A PromptSection with role "context".
 */
function buildContextSection(
  basePrompt: string,
  mounted: readonly MountedEntry[],
  pool: readonly PoolEntry[],
): PromptSection {
  // Build lookup maps.
  const mountedByName = new Map<string, MountedEntry>();
  for (const m of mounted) {
    // In case of duplicate names, first registration wins.
    if (!mountedByName.has(m.entry.name)) {
      mountedByName.set(m.entry.name, m);
    }
  }

  const poolByName = new Map<string, PoolEntry>();
  for (const p of pool) {
    if (!poolByName.has(p.entry.name)) {
      poolByName.set(p.entry.name, p);
    }
  }

  // Collect placeholders we need to process.
  const matches: Array<{
    index: number;
    length: number;
    name: string;
  }> = [];

  for (const match of basePrompt.matchAll(PLACEHOLDER_RE)) {
    matches.push({
      index: match.index!,
      length: match[0].length,
      name: match[1]!,
    });
  }

  if (matches.length === 0) {
    // Fast path: no placeholders at all.
    return { role: "context", content: basePrompt };
  }

  // Resolve each placeholder.
  const availableHints: string[] = [];

  // Replacement entries in reverse index order so earlier indices stay valid.
  const replacements: Array<{
    index: number;
    length: number;
    text: string;
  }> = [];

  for (const match of matches) {
    const mountedEntry = mountedByName.get(match.name);

    if (mountedEntry) {
      // CASE 1: Name is mounted — replace with its content.
      replacements.push({
        index: match.index,
        length: match.length,
        text: mountedEntry.entry.content,
      });
    } else {
      // Name not mounted.
      const poolEntry = poolByName.get(match.name);

      if (poolEntry) {
        // CASE 2: Name is in the pool but not mounted — leave as-is,
        //         queue an availability hint.
        replacements.push({
          index: match.index,
          length: match.length,
          text: `{{${match.name}}}`, // preserve original placeholder
        });
        availableHints.push(
          `[available: request "${match.name}" with schedule({entryIds: ["${poolEntry.entry.id}"]})]`,
        );
      } else {
        // CASE 3: Name not found anywhere — diagnostic marker.
        replacements.push({
          index: match.index,
          length: match.length,
          text: `[entry not mounted: ${match.name}]`,
        });
      }
    }
  }

  // Apply replacements in reverse order.
  replacements.sort((a, b) => b.index - a.index);
  let resolved = basePrompt;
  for (const r of replacements) {
    resolved =
      resolved.slice(0, r.index) + r.text + resolved.slice(r.index + r.length);
  }

  // Append availability hints at the end, if any.
  if (availableHints.length > 0) {
    resolved +=
      "\n\n" +
      "---\n" +
      "**Available context entries (not mounted — request by name):**\n" +
      availableHints.join("\n");
  }

  return { role: "context", content: resolved };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Compose a `ContextAssembly` and a base prompt into a `FinalPrompt`.
 *
 * The composition produces three ordered prompt sections:
 *
 * | Section    | Role       | Source                        |
 * |------------|------------|-------------------------------|
 * | ToC        | `"toc"`    | `assembly.pool` (metadata)    |
 * | Injected   | `"injected"` | `assembly.mounted` (content) |
 * | Context    | `"context"` | basePrompt + placeholder res. |
 *
 * **Pure function** — no I/O, no side effects, deterministic (over the
 * inputs).  The caller is responsible for loading file and generator
 * entry content before passing the assembly to this function.
 *
 * @param assembly   The fully-resolved context assembly from the pipeline.
 * @param basePrompt The raw prompt template with optional `{{name}}` markers.
 * @returns A `FinalPrompt` with three sections and the assembly metrics.
 */
export function compose(
  assembly: ContextAssembly,
  basePrompt: string,
): FinalPrompt {
  const sections: PromptSection[] = [
    buildTocSection(assembly.pool),
    buildInjectedSection(assembly.mounted),
    buildContextSection(basePrompt, assembly.mounted, assembly.pool),
  ];

  return {
    sections,
    metrics: assembly.metrics,
  };
}
