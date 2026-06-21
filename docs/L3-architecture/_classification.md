# L3 Architecture: Module Classification

Complete classification of all 16 L2 functional modules into Frontend (用户交互层) vs Backend (数据处理层) layers, using the 4-quadrant backend model.

## Classification Table

| # | Module | Primary | Secondary | Justification | L2 Doc Ref |
|---|--------|---------|-----------|---------------|------------|
| 1 | `configuration` | 输入 (Input) | — | Pure configuration type system. Defines Zod schemas for tool parameter validation — parses/validates incoming user-provided data at the system boundary. No runtime logic beyond validation. Is the foundation of the config input layer. | [configuration.md](../L2-modules/configuration.md) |
| 2 | `profile-management` | 输入 (Input) | — | Loads, parses, and validates subagent profile definitions from YAML frontmatter in `.profiles/*.md` files. Performs file-system data ingestion and schema validation. Pure input: reads config from disk, returns typed data. | [profile-management.md](../L2-modules/profile-management.md) |
| 3 | `project-policy` | 输入 (Input) | — | Reads and validates project-level security/policy JSON from `.pi/efficiency-subagent/config.json`. Validates against `ProjectPolicySchema`. Graceful degradation on missing/invalid files (null = "allow all"). Pure configuration input loading. | [project-policy.md](../L2-modules/project-policy.md) |
| 4 | `durable-run-storage` | 存储 (Storage) | — | Manages `.pi/subagents/runs/` directory lifecycle: creates run dirs with deterministic naming, writes/reads JSONL event/tool/session logs, searches across runs, formats run listings, applies retention cleanup. Pure persistence — no computation, no display. | [durable-run-storage.md](../L2-modules/durable-run-storage.md) |
| 5 | `run-artifact-generation` | 输出 (Output) | — | Produces structured output artifacts from raw run events: handoff markdown documents (`writeHandoff()`) for session continuity, and human-readable transcripts (`buildTranscript()`, `buildJsonTranscript()`) for review/debugging. Transforms raw event data into formatted, persistable output. | [run-artifact-generation.md](../L2-modules/run-artifact-generation.md) |
| 6 | `registry-types` | 计算 (Computation) | — | Shared type contract for the Prompt Registry system. Defines `RegistryEntry`, `CallRecord`, `ScheduleState`, `ResolvedEntry`, `RunContext`, lifecycle/frequency configs. All fields are `readonly` — designed for immutable data flow through the computation pipeline. Foundation of the registry computation system. | [registry-types.md](../L2-modules/registry-types.md) |
| 7 | `registry-storage` | 存储 (Storage) | — | Layer 1 of Prompt Registry: persistent JSONL-backed storage (`registry.jsonl` full-rewrite, `registry-calls.jsonl` append-only) with four O(1) in-memory indexes (IdIndex, NameIndex, TagIndex, GroupIndex). Sliding-window frequency tracking with serialization for session resume. Pure persistence + indexing. | [registry-storage.md](../L2-modules/registry-storage.md) |
| 8 | `registry-engine` | 计算 (Computation) | — | Layers 2+3 of Prompt Registry: stateless 5-stage resolution pipeline (Collect→Dedup→Filter→Sort→Load) + stateful `ScheduleOrchestrator` for LLM-callable scheduling. Pure computation: transforms `ScheduleState` into `ResolvedEntry[]` via deterministic pipeline. | [registry-engine.md](../L2-modules/registry-engine.md) |
| 9 | `registry-composer` | 计算 (Computation) | 输出 (Output) | Top-level registry consumer: assembles the final LLM prompt message via 3-section composition (ToC table + injected entries + placeholder-resolved base prompt). Primary: computation (text assembly, placeholder resolution, composition logic). Secondary: produces the prompt text artifact consumed as output to the LLM. | [registry-composer.md](../L2-modules/registry-composer.md) |
| 10 | `runtime-core` | 操作 (Operation) | 计算 (Computation), 输出 (Output), 存储 (Storage) | ⚠️ **Boundary-crossing module** (see [_bugs.md](./_bugs.md)). Central execution orchestrator: handles tool dispatch action loop (Operation primary), but also directly performs computation (policy enforcement, retry logic), output generation (handoff/transcript), and storage operations (session persistence, run directory creation). Orchestrator by design, but spans all four backend quadrants. | [runtime-core.md](../L2-modules/runtime-core.md) |
| 11 | `prompt-engine` | 计算 (Computation) | — | Stateful rendering engine: injects dynamic content into agent prompts via registry composition, `{{name}}` placeholder replacement, and priority-ordered slot prepending. Maintains module-level mutable state (slots, stacks, placeholders, event log) with serialization for multi-turn continuation. Pure computation — text composition and state management. | [prompt-engine.md](../L2-modules/prompt-engine.md) |
| 12 | `hook-system` | 计算 (Computation) | — | Hook lifecycle management subsystem: type definitions, safe script execution with timeout guards, and output injection bridges (direct slot setter + registry-backed entry). Executes user-defined hook scripts and processes their results. Pure computation pipeline — no display, no storage ownership. | [hook-system.md](../L2-modules/hook-system.md) |
| 13 | `policy-engine` | 计算 (Computation) | — | Permission enforcement engine: merges multiple `PolicyEntry` sources into a unified `MergedPolicy`, then evaluates every tool invocation across 7 dimensions (tool names, file paths, bash commands, network, env vars, nested subagent calls). Pure decision logic — self-contained with no external dependencies. | [policy-engine.md](../L2-modules/policy-engine.md) |
| 14 | `display-tui` | 显示 (Display) | — | Terminal UI event formatting: `DisplayEvent` data model, 10 factory functions for lifecycle events, compact single-line and sectioned multi-line renderers with ANSI color/icon support. Pure display — takes event data, formats for user consumption. No computation beyond formatting. | [display-tui.md](../L2-modules/display-tui.md) |
| 15 | `hook-scripts` | 计算 (Computation) | — | User-authored executable hook scripts (shell commands, filesystem inspection, phase announcements, registry snapshots). Each script implements `(HookContext) => Promise<HookResult>`. Dynamically loaded and executed by hook-system. Perform computation during hook lifecycle phases. | [hook-scripts.md](../L2-modules/hook-scripts.md) |
| 16 | `root-entry` | 操作 (Operation) | 显示 (Display) | Extension entry point: registers `efficiency_subagent` tool on PI Coding Agent `ExtensionAPI`, validates tool parameters, dispatches to `executeRun()`, renders TUI events. Primary: tool registration and command dispatch (Operation). Secondary: calls TUI renderers for result display. Sole integration boundary between extension and host. | [root-entry.md](../L2-modules/root-entry.md) |

## Summary Statistics

| Layer | Quadrant | Count | Modules |
|-------|----------|-------|---------|
| **Frontend** | 显示 (Display) | 1 | `display-tui` |
| **Frontend** | 操作 (Operation) | 2 | `runtime-core`, `root-entry` |
| **Backend** | 输入 (Input) | 3 | `configuration`, `profile-management`, `project-policy` |
| **Backend** | 输出 (Output) | 1 (+1 secondary) | `run-artifact-generation` (+ `registry-composer` secondary) |
| **Backend** | 存储 (Storage) | 2 | `durable-run-storage`, `registry-storage` |
| **Backend** | 计算 (Computation) | 7 (+1 secondary) | `registry-types`, `registry-engine`, `registry-composer`, `prompt-engine`, `hook-system`, `policy-engine`, `hook-scripts` (+ `runtime-core` secondary) |
| **Total** | — | **16** | — |

**Frontend total: 3** | **Backend total: 13** | **Boundary violators: 1** (`runtime-core`)

## Classification Methodology

Each module was classified by its **primary purpose** (what the module fundamentally exists to do), not by its file location or incidental side effects:

- **显示 (Display)**: Modules whose _raison d'être_ is formatting/presenting information to human users. Identified by: ANSI rendering, terminal output, event visualization.
- **操作 (Operation)**: Modules whose core function is handling user commands, dispatching tool invocations, managing interaction flow. Identified by: tool registration, action loops, command dispatch.
- **输入 (Input)**: Modules whose primary role is parsing, loading, or validating data coming into the system from external sources (config files, user parameters, disk files). Identified by: Zod validation, YAML parsing, JSON loading.
- **输出 (Output)**: Modules whose primary role is producing, formatting, and persisting outgoing artifacts (documents, logs, structured output). Identified by: artifact generation, document assembly, transcript building.
- **存储 (Storage)**: Modules whose core function is managing persistent data (directories, files, databases, indexes). Identified by: JSONL I/O, directory management, indexing, CRUD operations.
- **计算 (Computation)**: Modules that perform logic, processing, transformation, or decision-making. Identified by: pipelines, evaluation logic, state machines, text composition, template expansion.

Secondary classifications are noted where a module has a significant secondary purpose. Boundary violations (modules whose single-file codebase spans frontend and backend quadrants) are documented in [_bugs.md](./_bugs.md).
