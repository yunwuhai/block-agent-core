# L2 Modules — Additional Index

Supplemental grouping for modules not covered by the config/storage/runtime indexes. Core (`core-layer.md`) is the algorithmic foundation for the entire system — all pipelines, runners, and runtime layers depend on its types, registry, and composer.

## Modules

| Module | L1 Docs | Purpose |
|---|---|---|
| [core-layer](./core-layer.md) | core-types, core-registry, core-pipeline, core-composer, core-capability | Pure-algorithm foundation: assembly pipeline, in-memory registry, capability DAG, prompt composer. |
| [entry-layer](./entry-layer.md) | entry-index, tests-entry-test, index | Assembler layer — wires all dependencies and exports `executeRun()` as the public API. |
| [policy-engine](./policy-engine.md) | policy-evaluator, policy-mod | Permission enforcement: evaluate tool actions against merged policy. |
| [root-entry](./root-entry.md) | index | Extension entry point and PI tool registration. |

## Cross-Module Dependency Graph

```
core-layer (pure, no I/O dependencies)
  └── node:crypto (deterministic hashing)

entry-layer (assembler)
  -> core-layer             (re-exports + pipeline/composer)
  -> runtime-layer          (registry-store, run lifecycle, actions)
       -> policy-engine
       -> storage/event-log

root-entry (index.ts)
  -> backend/entry          (executeRun)
       -> entry-layer
