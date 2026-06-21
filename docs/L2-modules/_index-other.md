# L2 Modules — Additional Index

Supplemental grouping for modules not covered by the config/storage/runtime indexes.

## Modules

| Module | L1 Docs | Purpose |
|---|---|---|
| [policy-engine](./policy-engine.md) | policy-merge, policy-evaluator, policy-mod | Permission enforcement: merge policies and evaluate tool actions. |
| [root-entry](./root-entry.md) | index | Extension entry point and PI tool registration. |

## Cross-Module Dependency Graph

```
root-entry (index.ts)
  -> backend/input       (ToolParamsSchema)
  -> frontend/operation  (executeRun)
       -> policy-engine
       -> storage/output
       -> prompt/registry
```
