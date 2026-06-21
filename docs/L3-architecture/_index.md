# L3 Architecture: Overview

Complete layer architecture for the efficiency-subagent project — classification of all 16 L2 functional modules into Frontend (用户交互层) vs Backend (数据处理层) layers, using the 4-quadrant backend model.

> **Step 3 of 6.** This architecture separation drives the directory reorganization in Step 4.

---

## Layer Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                        FRONTEND (用户交互层)                       │
│                                                                  │
│  ┌─────────────────────────┐  ┌────────────────────────────────┐ │
│  │    显示 (Display)        │  │     操作 (Operation)            │ │
│  │                         │  │                                │ │
│  │  display-tui            │  │  root-entry                    │ │
│  │  ┌───────────────────┐  │  │  ┌──────────────────────────┐  │ │
│  │  │ • DisplayEvent    │  │  │  │ • Tool registration      │  │ │
│  │  │ • Factory fns (10)│  │  │  │ • Param validation       │  │ │
│  │  │ • renderCompact() │  │  │  │ • executeRun() dispatch  │  │ │
│  │  │ • renderSectioned()│  │  │  │ • TUI result rendering   │  │ │
│  │  │ • ANSI colors     │  │  │  └──────────────────────────┘  │ │
│  │  └───────────────────┘  │  │                                │ │
│  └─────────────────────────┘  │  runtime-core ⚠️               │ │
│                               │  ┌──────────────────────────┐  │ │
│                               │  │ • Action loop dispatch   │  │ │
│                               │  │ • Lifecycle orchestration│  │ │
│                               │  │ • (spans all layers)     │  │ │
│                               │  └──────────────────────────┘  │ │
│                               └────────────────────────────────┘ │
│                                    │  ▲                          │
├────────────────────────────────────┼──┼──────────────────────────┤
│                        BACKEND (数据处理层)                       │
│                                    │  │                          │
│  ┌──────────────┐  ┌──────────────┐│  │┌───────────────────────┐ │
│  │ 输入 (Input)  │  │ 输出 (Output) ││  ││ 计算 (Computation)    │ │
│  │              │  │              ││  ││                       │ │
│  │ configuration│  │ run-artifact ││  ││ policy-engine         │ │
│  │ ┌──────────┐ │  │ -generation ││  ││ ┌───────────────────┐ │ │
│  │ │ Zod      │ │  │ ┌──────────┐ ││  ││ │ mergePolicies()   │ │ │
│  │ │ schemas  │ │  │ │ Handoff  │ ││  ││ │ evaluate()        │ │ │
│  │ └──────────┘ │  │ │ .md      │ ││  ││ │ 7-dimension check │ │ │
│  │              │  │ ├──────────┤ ││  ││ └───────────────────┘ │ │
│  │ profile-     │  │ │ Transcript│ ││  ││                       │ │
│  │ management   │  │ │ .md/json │ ││  ││ registry pipeline     │ │
│  │ ┌──────────┐ │  │ └──────────┘ ││  ││ ┌───────────────────┐ │ │
│  │ │ YAML     │ │  │              ││  ││ │ registry-types    │ │ │
│  │ │ parser   │ │  └──────────────┘│  ││ │ registry-engine   │ │ │
│  │ └──────────┘ │                  │  ││ │ registry-composer │ │ │
│  │              │                  │  ││ └───────────────────┘ │ │
│  │ project-     │                  │  ││                       │ │
│  │ policy       │                  │  ││ prompt-engine         │ │
│  │ ┌──────────┐ │                  │  ││ ┌───────────────────┐ │ │
│  │ │ JSON     │ │                  │  ││ │ renderPrompt()    │ │ │
│  │ │ loader   │ │                  │  ││ │ setSlot/push/pop  │ │ │
│  │ └──────────┘ │                  │  ││ │ serializeSlots()  │ │ │
│  └──────────────┘                  │  ││ └───────────────────┘ │ │
│                                    │  ││                       │ │
│  ┌─────────────────────────────────┐│ ││ hook-system           │ │
│  │ 存储 (Storage)                   ││ ││ ┌───────────────────┐ │ │
│  │                                 ││ ││ │ runHookScripts()  │ │ │
│  │ durable-run-storage             ││ ││ │ injectOutput()    │ │ │
│  │ ┌─────────────────────────────┐ ││ ││ │ HookContext types  │ │ │
│  │ │ .pi/subagents/runs/         │ ││ ││ └───────────────────┘ │ │
│  │ │   {run-id}/                 │ ││ ││                       │ │
│  │ │   ├── session.json          │◄┼┘ ││ hook-scripts          │ │
│  │ │   ├── events.jsonl          │  │ ││ ┌───────────────────┐ │ │
│  │ │   ├── tools.jsonl           │  │ ││ │ before-mkdir.ts   │ │ │
│  │ │   └── handoff.md            │  │ ││ │ after-mkdir.ts    │ │ │
│  │ └─────────────────────────────┘  │ ││ │ announce-phase.ts │ │ │
│  │                                 │ ││ │ registry-output   │ │ │
│  │ registry-storage                │ ││ └───────────────────┘ │ │
│  │ ┌─────────────────────────────┐ │ │└───────────────────────┘ │
│  │ │ registry.jsonl (full rw)    │ │ │                          │
│  │ │ registry-calls.jsonl (app)  │ │ │                          │
│  │ │ 4x O(1) indexes             │◄┼─┘                          │
│  │ │ SlidingWindowCounter        │ │                            │
│  │ └─────────────────────────────┘ │                            │
│  └─────────────────────────────────┘                            │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Between Layers

### Primary Execution Flow (top-down)

```
User invokes efficiency_subagent tool
        │
        ▼
┌─── Frontend 操作 ───┐
│   root-entry        │  1. Reset slots
│   (index.ts)        │  2. Validate ToolParams
│                     │  3. Dispatch to executeRun()
└────────┬────────────┘
         │
         ▼
┌─── Backend 输入 ────┐
│   profile-mgmt      │  4. Load profile YAML
│   project-policy    │  5. Load project config JSON
│   configuration     │     (types consumed throughout)
└────────┬────────────┘
         │
         ▼
┌─── Backend 计算 ────┐
│   policy-engine     │  6. Merge policies
│   hook-system       │  7. Execute before_agent hooks
│   prompt-engine     │  8. Register placeholders/slots
│                     │  9. Build final prompt
└────────┬────────────┘
         │
         ▼
┌─── Frontend 操作 ───┐
│   runtime-core      │  10. Action loop:
│   (action loop)     │      for each action →
│                     │        evaluate policy
│                     │        execute hooks
│                     │        simulate tool
└────────┬────────────┘
         │
         ▼
┌─── Backend 输出 ────┐
│   run-artifact-gen  │  11. Build transcript
│                     │  12. Write handoff.md
└────────┬────────────┘
         │
         ▼
┌─── Backend 存储 ────┐
│   durable-run-stor  │  13. Persist session state
│                     │  14. Append events/tools JSONL
└────────┬────────────┘
         │
         ▼
┌─── Frontend 显示 ───┐
│   display-tui       │  15. Render event stream
│                     │  16. Format run result
└─────────────────────┘
         │
         ▼
    Return RunResult to user
```

### Prompt Composition Sub-Flow (Backend 计算)

```
prompt-engine (renderPromptWithRegistry)
        │
        ├──► registry-composer (composeMessage)
        │       │
        │       ├──► registry-engine (orchestrator.schedule state)
        │       │       │
        │       │       └──► registry-engine (resolveScheduled)
        │       │               │
        │       │               ├── Collect → Dedup → Filter → Sort → Load
        │       │               │
        │       │               └──► registry-storage (queries + frequency)
        │       │
        │       └──► Build ToC + Inject entries + resolve {{placeholders}}
        │
        └──► Legacy fallback: replacePlaceholders + prepend slots
```

### Hook Execution Sub-Flow (Backend 计算)

```
runtime-core (runPhaseHook)
        │
        └──► hook-system (runHookScripts)
                │
                ├──► hook-scripts (dynamic-import user scripts)
                │       │
                │       └──► Execute: spawnSync ls, read files, format output
                │
                └──► hook-system (injectHookOutputAsSlot / registerHookOutput)
                        │
                        └──► prompt-engine (setSlot / registry.register)
```

---

## Summary Statistics

### Module Count by Layer

```
FRONTEND (3 modules, 18.75%)
├── 显示 (Display):  1 module   (6.25%)
└── 操作 (Operation): 2 modules  (12.50%)

BACKEND (13 modules, 81.25%)
├── 输入 (Input):        3 modules  (18.75%)
├── 输出 (Output):       1 module   (6.25%)  [+1 secondary]
├── 存储 (Storage):      2 modules  (12.50%)
└── 计算 (Computation):  7 modules  (43.75%)  [+1 secondary]
```

### Layer Purity

| Metric | Count |
|--------|-------|
| Pure-single-quadrant modules | 13 |
| Multi-quadrant (same side) | 2 (`registry-composer`: 计算+输出; `root-entry`: 操作+显示) |
| Boundary violators (cross frontend/backend) | 1 (`runtime-core`: 操作 + 计算 + 输出 + 存储) |
| **Total modules** | **16** |

### Largest Layer

**计算 (Computation)** at 7 modules (43.75%) — the computational core dominates the architecture. This is expected for a subagent system where the primary value is in processing logic: policy evaluation, prompt composition, hook execution, and registry management.

---

## Design Principles Applied

1. **Classify by PURPOSE, not location.** Modules are classified by what they fundamentally do, not which directory they sit in. Example: `run-artifact-generation` lives under `storage/` but is classified as 输出 because its purpose is artifact generation, not storage management.

2. **Primary classification drives placement.** Secondary classifications are noted for completeness but do not determine layer membership. A module's primary purpose determines where it belongs in the architecture.

3. **Boundary violations are bugs, not features.** The `runtime-core` violation is a legitimate architectural concern — not an acceptable pattern — and is documented with concrete split recommendations in [_bugs.md](./_bugs.md).

4. **Frontend talks to Backend through defined interfaces.** The 操作 layer calls into 计算 and 存储, which feed 输出, which flows to 显示. No backend module directly calls a frontend module.

---

## Related Documents

| Document | Description |
|----------|-------------|
| [_classification.md](./_classification.md) | Complete classification table with justification for all 16 modules |
| [frontend-display.md](./frontend-display.md) | 显示 layer: display-tui module detail |
| [frontend-operation.md](./frontend-operation.md) | 操作 layer: runtime-core + root-entry module detail |
| [backend-input.md](./backend-input.md) | 输入 layer: configuration, profile-management, project-policy |
| [backend-output.md](./backend-output.md) | 输出 layer: run-artifact-generation (+ secondary modules) |
| [backend-storage.md](./backend-storage.md) | 存储 layer: durable-run-storage, registry-storage |
| [backend-computation.md](./backend-computation.md) | 计算 layer: 7 modules — registry pipeline, prompt-engine, hook-system, policy-engine, hook-scripts |
| [_bugs.md](./_bugs.md) | Boundary violation analysis: runtime-core split recommendations |

---

## Step 4 Outcome: COMPLETED

**The Step 4 directory reorganization is complete.** Source files now live under L3 layer directories (`frontend/` and `backend/`) while `index.ts` remains at the project root as the PI extension entry point.

### Actual Current Directory Structure (post-Step 4)

```
efficiency-subagent/
├── index.ts                          # root-entry (Frontend 操作 entry point)
├── frontend/
│   ├── display/                      # 显示 layer — display-tui
│   │   ├── events.ts
│   │   ├── iso-now.ts
│   │   └── mod.ts
│   └── operation/                    # 操作 layer — runtime-core
│       ├── orchestrator.ts
│       ├── tool-simulator.ts
│       └── mod.ts
├── backend/
│   ├── input/                        # 输入 layer — configuration/profile/project policy
│   │   ├── schema.ts
│   │   ├── params.ts
│   │   ├── profile-loader.ts
│   │   ├── project-loader.ts
│   │   └── mod.ts
│   ├── output/                       # 输出 layer — handoff/transcript projection
│   │   ├── handoff-store.ts
│   │   └── transcript-projector.ts
│   ├── storage/                      # 存储 layer — durable run storage
│   │   ├── event-log.ts
│   │   ├── run-artifacts.ts
│   │   └── mod.ts
│   └── computation/                  # 计算 layer
│       ├── policy/
│       │   ├── evaluator.ts
│       │   ├── helpers.ts
│       │   ├── merge.ts
│       │   └── mod.ts
│       ├── prompt/
│       │   └── engine.ts
│       ├── hooks/
│       │   ├── runner.ts
│       │   ├── slot-insertion.ts
│       │   ├── types.ts
│       │   └── mod.ts
│       ├── scripts/
│       │   ├── _utils.ts
│       │   ├── before-mkdir.ts
│       │   ├── after-mkdir.ts
│       │   ├── announce-phase.ts
│       │   └── registry-output.ts
│       └── registry/
│           ├── types.ts
│           ├── storage.ts
│           ├── resolution.ts
│           ├── orchestration.ts
│           ├── composer.ts
│           └── mod.ts
└── tests/                # Test harness
```

### Completion Notes

1. `runtime-core` is now split and housed in `frontend/operation/`.
2. Backend layers are separated into input, output, storage, and computation directories.
3. Relative imports in source, root entry, and tests were updated to the new physical paths.
4. L2 Physical Location sections now point at the completed L3 layout.

## Next Step (Step 5 — Pending)

After Step 4 verification, Step 5 can proceed from the finalized layer-aligned directory structure.
