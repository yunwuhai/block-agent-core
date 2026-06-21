# L3 Architecture: Backend — 计算 (Computation)

Layer for modules that perform logic, processing, transformation, or decision-making — the computational core of the system.

> **Quadrant definition:** Modules that perform logic/processing (policy evaluation, resolution pipeline, template expansion, orchestration scheduling).

## Member Modules

| # | Module | Primary | Description | L2 Doc |
|---|--------|---------|-------------|--------|
| 1 | `registry-types` | 计算 | Shared type contract for the Prompt Registry — `RegistryEntry`, `CallRecord`, `ScheduleState`, `ResolvedEntry`, lifecycle/frequency configs. Foundation of the computation pipeline. | [registry-types.md](../L2-modules/registry-types.md) |
| 2 | `registry-engine` | 计算 | Layers 2+3 of Prompt Registry: 5-stage resolution pipeline + stateful `ScheduleOrchestrator` for LLM-callable scheduling. | [registry-engine.md](../L2-modules/registry-engine.md) |
| 3 | `registry-composer` | 计算 (secondary: 输出) | Top-level registry consumer: assembles final LLM prompt via 3-section composition (ToC + injected entries + placeholder-resolved prompt). | [registry-composer.md](../L2-modules/registry-composer.md) |
| 4 | `prompt-engine` | 计算 | Stateful rendering engine: dynamic slot/placeholder management, registry-based composition, legacy text rendering, serialization for multi-turn continuation. | [prompt-engine.md](../L2-modules/prompt-engine.md) |
| 5 | `hook-system` | 计算 | Hook lifecycle management: type definitions, safe script execution with timeouts, output injection bridges into prompt-engine. | [hook-system.md](../L2-modules/hook-system.md) |
| 6 | `policy-engine` | 计算 | Permission enforcement: merges policy entries, evaluates tool invocations across 7 dimensions (tool names, paths, bash, network, env, subagents). | [policy-engine.md](../L2-modules/policy-engine.md) |
| 7 | `hook-scripts` | 计算 | User-authored executable hook scripts — shell commands, filesystem inspection, phase announcements, registry snapshots. | [hook-scripts.md](../L2-modules/hook-scripts.md) |

---

## Module Detail: `registry-types`

**Purpose:** Shared type contract for the entire Prompt Registry system. Defines every data shape consumed across all three registry layers, the composer, and external consumers.

### Member L1 Files

| L1 Doc | Content |
|--------|---------|
| `registry-types.md` | `RegistryEntry`, `CallRecord`, `ScheduleState`, `ResolvedEntry`, `RunContext`, `EntryType`, `LifecycleConfig`, `FrequencyConfig`, `SlidingWindowState`, and discriminator/union types. |

### Key Types

- `RegistryEntry` — Central unit: `{id, name, type, content?, filePath?, tags, group, priority, lifecycle, frequency, ...}`
- `CallRecord` — Injection audit: `{entryId, trigger, timestamp, runId}`
- `ScheduleState` — Per-round schedule: `{tags, ids, groups, templates}`
- `ResolvedEntry` — Ready-to-inject: `{entry, content, source}`
- `RunContext` — Runner metadata passed through the pipeline

### Why This Classification

`registry-types` is classified as 计算 because it is the **computational blueprint** for the entire registry system. While types themselves are passive, this module defines the data model that enables the 5-stage resolution pipeline, the orchestration scheduling, and the composition logic. All fields are `readonly` — designed for immutable data flow through a pure computational pipeline. Without these types, the registry computation cannot exist.

---

## Module Detail: `registry-engine`

**Purpose:** The runtime engine of the Prompt Registry, spanning Layer 2 (resolution) and Layer 3 (orchestration). Orchestration builds a mutable `ScheduleState` via LLM-callable tool methods; resolution consumes that state through a 5-stage pipeline to produce ordered, deduplicated `ResolvedEntry[]`.

### Member L1 Files

| L1 Doc | Role |
|--------|------|
| `registry-resolution.md` | Stateless 5-stage pipeline: Collect → Dedup → Filter → Sort → Load. Exports `resolveScheduled()`, `isActive()`, `exceedsFrequency()`, `expandTemplate()`. |
| `registry-orchestration.md` | Stateful `ScheduleOrchestrator` class: mutable per-round schedule manager with schedule/unschedule/query operations designed as LLM tool implementations. |

### The 5-Stage Resolution Pipeline

```
ScheduleState ──► 1. COLLECT  ──► Expand tags→IDs, collect IDs, expand groups/templates
                          │
                          ▼
                  2. DEDUP  ──► Map<id, RegistryEntry>
                          │
                          ▼
                  3. FILTER ──► isActive(lifecycle, runCtx) && !exceedsFrequency()
                          │
                          ▼
                  4. SORT   ──► By priority descending
                          │
                          ▼
                  5. LOAD   ──► Inline content or read filePath from disk
                          │
                          ▼
                   ResolvedEntry[]
```

### Why This Classification

`registry-engine` is **pure computation**. The resolution pipeline is a deterministic, stateless transformation from `ScheduleState` to `ResolvedEntry[]`. The orchestrator is a stateful scheduler that exposes an API designed for LLM tool consumption. Both layers perform logic, filtering, sorting, and template expansion — the computational core of the Prompt Registry.

---

## Module Detail: `registry-composer`

**Purpose:** Top-level consumer of the Prompt Registry. Assembles the final LLM prompt message by composing three sections: Table of Contents (ToC) of available entries, full content of currently scheduled entries, and the base prompt with `{{name}}` placeholders resolved to entry content. Records call history for every injected entry.

### Member L1 Files

| L1 Doc | Role |
|--------|------|
| `registry-composer.md` | Single-file: `composeMessage()` 3-section builder, `buildToCTable()` standalone markdown table, `replacePlaceholders()` placeholder resolver. |

### Composition Flow

```
composeMessage(options)
  ├── 1. HEAD:  buildToCTable()        ← Markdown table of available entries
  ├── 2. BODY:  resolveScheduled()     ← Delegates to registry-engine for 5-stage resolution
  │             + recordCall()         ← Side-effect: audit log per injection
  └── 3. FOOT:  replacePlaceholders()  ← {{name}} → entry content resolution
```

### Why Primary = 计算

Despite producing a text artifact (the prompt), `registry-composer` is primarily a **computational module**. Its core work is text assembly through defined rules and transformations: building tables, resolving placeholders, orchestrating the 5-stage pipeline, and recording injection history. The output text is a byproduct of the composition computation, not a separately managed artifact like handoff or transcript documents. Secondary 输出 classification acknowledges that the composed prompt IS consumed as output to the LLM.

---

## Module Detail: `prompt-engine`

**Purpose:** Standalone rendering engine that injects dynamic content into agent prompts via three strategies: registry-based composition (primary), `{{name}}` placeholder replacement (legacy), and named slot prepending by priority order (legacy). Maintains module-level mutable state for slots, stacks, placeholders, and an append-only event log. Supports serialization for multi-turn continuation.

### Member L1 Files

| L1 Doc | Source File | Role |
|--------|-------------|------|
| `runtime-prompt-slots-engine.md` | `runtime/prompt-slots/engine.ts` | Single-file: all slot/placeholder state, registry rendering pipeline, legacy renderer, mutation operations, persistence helpers, event log. |

### Key Exports

| Category | Exports |
|----------|---------|
| Registry | `setRegistry()`, `getRegistry()`, `getOrchestrator()`, `renderPromptWithRegistry()` |
| Placeholders (legacy) | `registerPlaceholder()`, `unregisterPlaceholder()`, `listPlaceholders()` |
| Slots (legacy) | `setSlot()`, `clearSlot()`, `pushSlot()`, `popSlot()`, `setOnceSlot()`, `listSlots()`, `listStacks()` |
| Lifecycle | `expireStaleSlots()`, `clearHookSlots()`, `renderPrompt()` (legacy), `getEventLog()`, `reset()` |
| Persistence | `serializeSlots()`, `deserializeSlots()` |

### Rendering Pipeline

```
renderPromptWithRegistry(base, runCtx)
  ├── Registry active? → composeMessage()
  │     ├── HEAD (ToC)
  │     ├── INJECTED (priority-ordered entries)
  │     └── CONTEXT (base prompt)
  └── Registry inactive? → renderPrompt() [legacy]
        ├── Replace {{name}} placeholders
        ├── expireStaleSlots()
        ├── Prepend slots by priority
        └── Consume one-shot slots
```

### Why This Classification

`prompt-engine` is pure **计算**. Its entire existence is about text computation: assembling prompts from multiple sources, applying priority ordering, resolving placeholders, managing TTL-based slot expiration, and tracking mutation history. The module-level mutable state (slots, stacks, placeholders) is implementation detail for the computation — it doesn't own persistent storage; it serializes to/from runtime-core for persistence.

---

## Module Detail: `hook-system`

**Purpose:** Complete subsystem for user-defined hook scripts that execute at four lifecycle points: `before_agent`, `after_agent`, `before_tool`, `after_tool`. Provides type definitions, safe script execution with timeout guards, and two output injection strategies (lightweight slot-setter and full registry-backed entry).

### Member L1 Files

| L1 Doc | Source File | Role |
|--------|-------------|------|
| `runtime-hooks-types.md` | `runtime/hooks/types.ts` | Type definitions: `HookContext`, `HookResult`, `HookSessionMessage` |
| `runtime-hooks-runner.md` | `runtime/hooks/runner.ts` | Script executor: validation, dynamic-import, sequential execution, timeout enforcement |
| `runtime-hooks-slot-insertion.md` | `runtime/hooks/slot-insertion.ts` | Output bridge: `injectHookOutputAsSlot()` (direct) and `registerHookOutput()` (registry-backed) |
| `runtime-hooks-mod.md` | `runtime/hooks/mod.ts` | Barrel re-exporting the public API |

### Execution Flow

```
HookContext ─→ runHookScripts(scripts, ctx)
                    │
                    ├── Validate script names (path-traversal block)
                    ├── Dynamic-import hook modules
                    ├── Execute with Promise.race(timeout)
                    └── Aggregate: slotContent, modifiedArgs, sessionMessage
                         │
                         ▼
                    HookResult
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
    injectHookOutputAsSlot()   registerHookOutput()
    (setSlot direct)           (registry.register + scheduleIds)
```

### Why This Classification

`hook-system` is a **computational pipeline**. The runner executes scripts and aggregates their results; the slot-insertion bridge processes `HookResult` data and injects it into `prompt-engine`. There is no display, no storage ownership, and no input parsing — pure execution, transformation, and bridging logic.

---

## Module Detail: `policy-engine`

**Purpose:** Permission enforcement engine. Merges multiple policy entries into a unified rule set, then evaluates every tool invocation (tool name, file paths, bash commands, network access, env vars, nested-subagent calls) against that merged policy to produce an allow/deny decision.

### Member L1 Files

| L1 Doc | Source File | Role |
|--------|-------------|------|
| `policy-merge.md` | `policy/merge.ts` | Policy composition: unions `PolicyEntry[]` into single `MergedPolicy` |
| `policy-evaluator.md` | `policy/evaluator.ts` | Decision engine: checks `ActionContext` against `MergedPolicy` across 7 dimensions |
| `policy-mod.md` | `policy/mod.ts` | Barrel re-exporting `mergePolicies`, `evaluate`, and all types |

### Evaluation Dimensions (in `evaluate()`)

1. Tool name allowlisting
2. Nested subagent gating (`efficiency_subagent` tool check)
3. File path matching with glob support (`*`, `**`) and exclusions
4. Bash command filtering (exact, prefix, glob→regex)
5. Bash path extraction (redirect targets, path arguments)
6. Network domain/port/scheme matching
7. Env var allow/deny

### Why This Classification

`policy-engine` is the **purest computation module**. It takes structured inputs (`PolicyEntry[]`, `ActionContext`), applies deterministic merging and evaluation logic, and returns a boolean decision with reasoning. Zero I/O, zero display, zero storage — 100% decision logic. Self-contained with no dependencies on other extension modules.

---

## Module Detail: `hook-scripts`

**Purpose:** Collection of shell-executable hook scripts that run before and after agent/tool lifecycle events. Each script receives a `HookContext`, performs an action (typically spawning a shell command or reading filesystem state), and returns a `HookResult` that may include a session message and/or slot content. Loaded dynamically by the hook runner via `import()`.

### Member L1 Files

| L1 Doc | Source File | Purpose |
|--------|-------------|---------|
| `hooks-scripts-_example.md` | `hooks/scripts/_example.ts` | Template/reference — minimal contract demonstration |
| `hooks-scripts-before-mkdir.md` | `hooks/scripts/before-mkdir.ts` | Pre-mkdir `ls -la` inspection |
| `hooks-scripts-after-mkdir.md` | `hooks/scripts/after-mkdir.ts` | Post-mkdir `ls -la` inspection |
| `hooks-scripts-announce-phase.md` | `hooks/scripts/announce-phase.ts` | Korean-localized phase labels injection |
| `hooks-scripts-registry-output.md` | `hooks/scripts/registry-output.ts` | Filesystem + registry snapshot |

### Script Contract

```typescript
async (ctx: HookContext) => Promise<HookResult>
// HookResult: { allowed: boolean, reason?, slotContent?, modifiedArgs?, sessionMessage? }
```

### Why This Classification

`hook-scripts` are classified as 计算 because they are **executable computational units** within the hook pipeline. Each script performs work (shell execution, filesystem reading, text formatting) and returns structured results that feed into the prompt computation chain. While they do perform I/O (shell commands), that I/O is in service of computation — gathering data to inject into the agent's context — not a persistence or display concern.

---

## Layer Position in Architecture

```
┌──────────────────────────────────────────────────┐
│                  BACKEND                          │
│  ┌──────┐ ┌───────┐ ┌─────────┐                  │
│  │ 输入  │ │ 输出   │ │ 存储     │                  │
│  └──────┘ └───────┘ └────┬────┘                  │
│                           │                       │
│  ┌────────────────────────▼─────────────────────┐ │
│  │  计算 (Computation)                            │ │
│  │                                               │ │
│  │  ┌──────────┐  ┌──────────────┐               │ │
│  │  │ policy-   │  │ registry     │               │ │
│  │  │ engine    │  │ pipeline     │               │ │
│  │  │           │  │ (types →     │               │ │
│  │  │ (decision)│  │  engine →    │               │ │
│  │  │           │  │  composer)   │               │ │
│  │  └──────────┘  └──────────────┘               │ │
│  │                                               │ │
│  │  ┌──────────┐  ┌──────────────┐               │ │
│  │  │ prompt-   │  │ hook-system  │               │ │
│  │  │ engine    │  │ + hook-      │               │ │
│  │  │ (text     │  │ scripts      │               │ │
│  │  │  comp)    │  │ (execution)  │               │ │
│  │  └──────────┘  └──────────────┘               │ │
│  └───────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

The 计算 layer is the **computational core** — 7 modules performing all business logic: permission decisions (policy-engine), prompt composition (prompt-engine, registry pipeline), and lifecycle execution (hook-system, hook-scripts). It is the largest layer by module count and the most interconnected — computation modules consume storage, produce data for output, and are orchestrated by the operation layer.
