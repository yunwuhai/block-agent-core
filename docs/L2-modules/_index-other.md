# L2 Modules — Index

Module-level documentation for the efficiency-subagent project, grouped by functional coupling. Each module doc covers: purpose, member files (L1 docs), per-file contribution summary, internal relationships, and external dependencies.

> **Step 4a status: DEFERRED.** No files were moved. All modules remain in their original directories. See each module's Physical Location section for current file paths.

## Modules

| Module | L1 Docs | Purpose |
|--------|---------|---------|
| [policy-engine](./policy-engine.md) | policy-merge, policy-evaluator, policy-mod | Permission enforcement — merges policies and evaluates tool actions |
| [display-tui](./display-tui.md) | display-iso-now, display-events, display-mod | Terminal UI event formatting — factories and renderers for the event stream |
| [hook-scripts](./hook-scripts.md) | hooks-scripts-_example, hooks-scripts-before-mkdir, hooks-scripts-after-mkdir, hooks-scripts-announce-phase, hooks-scripts-registry-output | Shell-executable lifecycle hooks — directory inspection, phase announcements, registry snapshots |
| [root-entry](./root-entry.md) | index | Extension entry point — registers `efficiency_subagent` tool, bootstraps full lifecycle |

## Cross-Module Dependency Graph

```
root-entry (index.ts)
  ├──▶ config        (ToolParamsSchema)
  ├──▶ runtime       (executeRun)
  │     ├──▶ policy-engine    (permission enforcement)
  │     ├──▶ hook-scripts     (lifecycle hooks)
  │     └──▶ storage          (session recording)
  └──▶ display-tui   (event rendering)
```

## Coverage

These 4 modules cover the 12 L1 docs specified in the analysis scope:

- **policy-engine**: 3 L1 docs (policy-merge, policy-evaluator, policy-mod)
- **display-tui**: 3 L1 docs (display-iso-now, display-events, display-mod)
- **hook-scripts**: 5 L1 docs (hooks-scripts-_example, before-mkdir, after-mkdir, announce-phase, registry-output)
- **root-entry**: 1 L1 doc (index)

**Total**: 12/12 L1 docs covered.

## Not Covered

The following L1 doc groups exist in the project but are outside this analysis scope (they belong to other modules not yet documented at L2):

- `config/` — Tool params, profile loader, project loader, schema (4 docs)
- `runtime/` — Runner, hooks (runner/types/slot-insertion/mod), prompt-slots engine, mod (7 docs)
- `storage/` — Event log, transcript projector, handoff store, mod (4 docs)
- `registry/` — Types, storage, resolution, composer, orchestration, mod (6 docs)
- `tests/` — Test files (10 docs)
