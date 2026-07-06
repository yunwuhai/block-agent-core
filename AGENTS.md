# AGENTS.md - better-subagent

The project is now centered on **Block Agent Core**: a PI Coding Agent extension that assembles context blocks, runs PI SDK subagents, lists selectable models, and archives results into a predictable file layout. Named exports still expose reusable lower-level modules, but the main public runtime surface is the `block_agent_core` tool.

## Core Rules

### Read docs first
When you need project structure or module intent, start with `docs/user-manual.md`. The main implementation lives under `core/`, `tool/`, `adapter/`, and `utils/`.

### Keep code and docs aligned
Whenever you change the public API surface, tool actions, exported symbols, or result/archive shape, update `docs/user-manual.md` in the same change.

| Layer | Path | Purpose |
|------|------|------|
| User manual | `docs/user-manual.md` | Main project guide for future agents |
| Skill | `skills/better-subagent/SKILL.md` | PI-facing usage entry |

## Dev Commands

```bash
bun test
tsc --noEmit
```

## Architecture At A Glance

- `tool/` - Public PI tool registration and action dispatch for `block_agent_core`.
- `tool/actions/` - The four public actions: `load_context`, `run_subagent`, `list_models`, `archive_result`.
- `core/` - Reusable context composition, turn/model/tool shaping, archive helpers, and older persistence-oriented modules that are no longer the main public story.
- `adapter/` - PI SDK integration and model registry bridging.
- `utils/` - Shared file helpers such as JSONL persistence and TOML helpers.
- `index.ts` - Default export registers the tool; named exports expose reusable modules.

## Constraints

- Keep the formal extension entrypoint focused on `block_agent_core`; do not reintroduce `dialogue_memory` CRUD-style public actions.
- Respect `exactOptionalPropertyTypes` and `verbatimModuleSyntax`; use `import type` for type-only imports.
- `core/` should stay free of PI-specific imports.
- `core/` should not use `as any`, `@ts-ignore`, or `@ts-expect-error`; keep unsafe adaptation isolated to the PI-facing tool layer when necessary.
- Do not skip tests.

## Avoid

- Changing public behavior without updating `docs/user-manual.md`.
- Reintroducing old CRUD-first runtime narratives in README, skill text, or tool registration.
- Weakening TypeScript strictness.
