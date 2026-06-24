# L2 Modules — efficiency-subagent

Functional module decomposition based on coupling analysis of `config/` and `storage/` L1 file documentation. Each module groups files that share types, call each other, and serve a common purpose.

## Modules

| # | Module | Files | Description |
|---|--------|-------|-------------|
| 1 | [Configuration](configuration.md) | 2 | Core configuration type system — Zod schemas and runtime tool-parameter validation. Foundation of the config layer. |
| 2 | [Profile Management](profile-management.md) | 1 | Load, parse, and validate subagent profile definitions from YAML frontmatter in `.profiles/*.md`. |
| 3 | [Project Policy](project-policy.md) | 1 | Load project-level security/policy configuration from `.pi/efficiency-subagent/config.json`. |
| 4 | [Durable Run Storage](durable-run-storage.md) | 1 | Run directory lifecycle management, JSONL event/tool/session logging, search, and retention cleanup. Foundation of the storage layer. |
| 5 | [Run Artifact Generation](run-artifact-generation.md) | 1 | Produce structured handoff documents and human-readable transcripts from raw run event data. |

| 6 | [Core Assembly](core-layer.md) | 5 | Pure-algorithm assembly pipeline — types, registry, pipeline, composer, capability |
| 7 | [Runtime I/O](runtime-layer.md) | 5 | Persistence, lifecycle, mount control, output formatting, prompt state |
| 8 | [Entry Layer](entry-layer.md) | 3 | Dependency wiring + public API |

## Barrel Files

One barrel file exists at the directory level:

| L1 Doc | Role |
|--------|------|
| `storage-mod.md` | `storage/mod.ts` — re-exports all public symbols from Durable Run Storage and Run Artifact Generation modules. Single storage-layer import point. |

## Dependency Flow

```
storage-event-log.md (Durable Run Storage)
  ↑ imports
  └── storage-run-artifacts.md (Run Artifact Generation)

Storage barrel (`storage-mod.md`) re-exports from Durable Run Storage → Run Artifact Generation.
```

## New Module Dependency Flow

```
core-layer (pure)
  └── node:crypto (deterministic hashing)

runtime-layer (I/O + lifecycle)
  -> core-layer (pipeline, composer, registry types)
  -> storage/   (event-log, run-artifacts)
  -> input/     (profile-loader, schema)
  -> policy/    (evaluator, loader)

entry-layer (assembler)
  -> core-layer    (re-exports + pipeline/composer)
  -> runtime-layer (registry-store, run lifecycle, actions)
```
