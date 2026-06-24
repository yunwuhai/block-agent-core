# L2 Modules — efficiency-subagent

Functional module decomposition based on coupling analysis of `config/` and `storage/` L1 file documentation. Each module groups files that share types, call each other, and serve a common purpose.

## Modules

| # | Module | Files | Description |
|---|--------|-------|-------------|
| 1 | [Configuration](configuration.md) | 2 | Core configuration type system — Zod schemas and runtime tool-parameter validation. Foundation of the config layer. |
| 2 | [Profile Management](profile-management.md) | 1 | Load, parse, and validate subagent profile definitions from YAML frontmatter in `.profiles/*.md`. |
| 3 | [Project Policy](project-policy.md) | 1 | Load project-level security/policy configuration from `.pi/efficiency-subagent/config.json`. |
| 4 | [Durable Run Storage](durable-run-storage.md) | 1 | Run directory lifecycle management, JSONL event/tool/session logging, search, and retention cleanup. Foundation of the storage layer. |
| 5 | [Run Artifact Generation](run-artifact-generation.md) | 2 | Produce structured handoff documents and human-readable transcripts from raw run event data. |

| 6 | [Core Assembly](core-layer.md) | 5 | Pure-algorithm assembly pipeline — types, registry, pipeline, composer, capability |
| 7 | [Runtime I/O](runtime-layer.md) | 4 | Persistence, lifecycle, mount control, output formatting |
| 8 | [Entry Layer](entry-layer.md) | 3 | Dependency wiring + public API |

## Barrel Files

Two barrel files exist at the directory level (not treated as standalone modules):

| L1 Doc | Role |
|--------|------|
| `config-mod.md` | `config/mod.ts` — re-exports all public symbols from Configuration, Profile Management, and Project Policy modules. Single config-layer import point. |
| `storage-mod.md` | `storage/mod.ts` — re-exports all public symbols from Durable Run Storage and Run Artifact Generation modules. Single storage-layer import point. |

## Dependency Flow

```
config-schema.md (Configuration)
  ↑ imports
  ├── config-profile-loader.md (Profile Management)
  └── config-project-loader.md (Project Policy)

storage-event-log.md (Durable Run Storage)
  ↑ imports
  ├── storage-handoff-store.md (Run Artifact Generation)
  └── storage-transcript-projector.md (Run Artifact Generation)
```

Config barrels (`config-mod.md`) re-exports from Configuration → Profile Management → Project Policy.
Storage barrel (`storage-mod.md`) re-exports from Durable Run Storage → Run Artifact Generation.

**No cross-layer dependencies** — config files do not import from storage, and storage files do not import from config.

## New Module Dependency Flow

```
core-layer (pure)
  └── node:crypto (deterministic hashing)

runtime-layer (I/O + lifecycle)
  -> core-layer (pipeline, composer, registry types)
  -> storage/   (event-log, run-artifacts)
  -> input/     (profile-loader, project-loader, schema)
  -> policy/    (evaluator, merge)

entry-layer (assembler)
  -> core-layer    (re-exports + pipeline/composer)
  -> runtime-layer (registry-store, run lifecycle, actions)
```
