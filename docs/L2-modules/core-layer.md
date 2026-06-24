# L2 Module: Core Assembly Layer

**Purpose:** Pure-algorithm foundation of better-subagent — provides the assembly pipeline, in-memory registry, capability DAG, and prompt composer. ALL functions are pure (no I/O, no side effects). This is the layer that external orchestrators can import independently.

## Member Files

| L1 Doc | Source File | Role |
|---|---|---|
| `core-types.md` | `backend/core/types.ts` | Type definitions — 19 exports forming the assembly vocabulary |
| `core-registry.md` | `backend/core/registry.ts` | In-memory Entry store with 5 O(1) indexes |
| `core-pipeline.md` | `backend/core/pipeline.ts` | 6-step assembly pipeline — heart of the assembly metaphor |
| `core-composer.md` | `backend/core/composer.ts` | 3-section prompt composer |
| `core-capability.md` | `backend/core/capability.ts` | Capability definitions + implies DAG |

## Architecture

```
Core Layer (pure)
  ├── types.ts         ← Vocabulary (Entry, ContextRequest, ContextAssembly...)
  ├── registry.ts      ← Data store (CRUD + 5 indexes + serialization)
  ├── capability.ts    ← Capability DAG (declaration + implies expansion)
  ├── pipeline.ts      ← Resolution engine (6-step deterministic transform)
  └── composer.ts      ← Output formatter (Assembly → FinalPrompt)
```

Three sub-layers:
- **Types** — single source of truth, every symbol flows through here
- **Data** — Registry + CapabilityRegistry are pure data structures
- **Processing** — Pipeline (resolution) + Composer (formatting) are pure functions

## Data Flow

```
ContextRequest + Registry + RunContext
       │
       ▼
  Pipeline.resolve()
       │ ① COLLECT (capabilities → entries, tags → entries, IDs → entries)
       │ ② RESOLVE_DEPS (recursive depends expansion, cycle guard)
       │ ③ CHECK_CONFLICTS (pairwise, lower-priority excluded)
       │ ④ FILTER (lifecycle inactive, frequency exceeded)
       │ ⑤ BUDGET_ALLOCATE (priority-sorted, pinned bypass)
       │ ⑥ LOAD_CONTENT (set needsRead/needsGenerate flags)
       ▼
  ContextAssembly
       │  mounted[]   (passed, injected into prompt)
       │  excluded[]  (rejected, with reason + detail)
       │  pool[]      (available, metadata-only for ToC)
       │  metrics
       ▼
  Composer.compose(assembly, basePrompt)
       │ ① ToC section    (pool entries — discoverable)
       │ ② Injected section (mounted entries — full content)
       │ ③ Context section  (basePrompt with {{name}} resolved)
       ▼
  FinalPrompt { sections[], metrics }
```

## Dependencies

| Dependency | Used For |
|---|---|
| `core/types.ts` | All type imports |
| `node:crypto` | Entry ID generation (SHA-256 hash) — only I/O-ish import, deterministic |

## Notes

- **Pure function guarantee**: Core modules never import `fs`, `path` (beyond `node:crypto` for hashing). Fully testable in isolation.
- **External reuse**: External orchestrator projects can `import { Registry, resolve, compose } from "better-subagent/core"` without loading the full runtime.
- **Deterministic**: Pipeline is fully deterministic when `RunContext.currentTimestampMs` is provided. The `Date.now()` fallback is the only permitted impurity.
