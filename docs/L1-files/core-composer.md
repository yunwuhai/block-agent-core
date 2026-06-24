# L1 -- `backend/core/composer.ts`

**Purpose:** Prompt Composer — pure function `compose()` that transforms `ContextAssembly + basePrompt` into `FinalPrompt` with three ordered sections: Table of Contents (pool entries for LLM discovery), Injected Content (mounted entries with full content), and Context (base prompt with `{{name}}` placeholders resolved to entry content or diagnostic markers).

**Lines:** 316

## Exports

| Export | Kind | Lines | Description |
|---|---|---|---|
| `compose` | function | 301--315 | Main entry point. Takes `assembly: ContextAssembly` + `basePrompt: string`, returns `FinalPrompt` with 3 sections + metrics. Pure function. |

## Internal

| Symbol | Lines | Description |
|---|---|---|
| `PLACEHOLDER_RE` | 51 | `/{{([\w-]+)}}/g` — matches `{{name}}` placeholders in base prompt |
| `buildTocSection(pool)` | 67--89 | Builds ToC section. Shows markdown table with Name, Description, Capabilities, Est. Tokens, Tags. Empty pool shows "(no additional entries available)". |
| `buildInjectedSection(mounted)` | 108--142 | Builds injected content section. Pinned entries first, then by priority descending. Each entry rendered as `// === name (reason) ===` header + content + `---` separator. |
| `buildContextSection(basePrompt, mounted, pool)` | 171--276 | Resolves `{{name}}` placeholders. 3 cases: mounted → replace with content; in pool → preserve placeholder + append availability hint; not found → `[entry not mounted: name]` marker. |

## Placeholder Resolution Algorithm

For each `{{name}}` in basePrompt:

1. **Mounted entry found** → replace `{{name}}` with `entry.content`
2. **Pool entry found (available but not mounted)** → preserve `{{name}}` as-is, append hint: `[available: request "name" with schedule({entryIds: ["id"]})]`
3. **Not found anywhere** → replace with diagnostic: `[entry not mounted: name]`

Hints for case 2 are collected and appended as a block after the resolved prompt text, separated by `---`.

All replacements applied in reverse index order (to preserve earlier indices during string mutation).

## Output Section Order

| Section | Role | Source |
|---|---|---|
| 1. Table of Contents | `"toc"` | `assembly.pool` (metadata only, content stripped) |
| 2. Injected Content | `"injected"` | `assembly.mounted` (full content) |
| 3. Context | `"context"` | `basePrompt` with `{{name}}` placeholders resolved |

## Notes

- **Pure function**: No I/O. Caller must load file/generator entries before calling.
- **Stable ordering**: Pinned entries render before priority-ordered entries in injected section.
- **Duplicate names**: First registration in `mountedByName` / `poolByName` wins.
- **Metrics passthrough**: `assembly.metrics` is forwarded unchanged to `FinalPrompt.metrics`.
