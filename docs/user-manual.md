# Efficiency Subagent — User Manual for LLM Agents

This manual explains how to use and understand the efficiency-subagent project. It is written for LLM agents that need to invoke, modify, or extend this plugin, not for human end users. Read this before reading source code; it provides architectural orientation and covers all public interfaces.

---

## What This Project Is

The efficiency-subagent is a profile-based subagent plugin for the PI Coding Agent. It lets you invoke controlled subagents with policy permissions, dynamic prompt registry control, and durable session persistence. Every run produces a structured handoff document so subsequent invocations can resume where the previous one left off. The plugin lives entirely inside the host agent's extension system and does not manage its own LLM calls or sandbox process.

---

## Architecture Overview

The system has 13 functional modules arranged in two layers (Frontend and Backend), with the Backend split into four quadrants:

```
┌──────────────────────────────────────────────────────────────┐
│  FRONTEND (user-facing)                                       │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Operation (操作)                                      │  │
│  │ root-entry (tool registration), runtime-core           │  │
│  │ action loop and durable artifact coordination          │  │
│  └────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────┤
│  BACKEND (data processing)                                    │
│  ┌──────────────┐ ┌──────────────┐ ┌────────┐ ┌────────────┐│
│  │ Input (输入)   │ │ Output (输出) │ │Storage │ │Computation ││
│  │ configuration │ │ run-artifact │ │(存储)   │ │ (计算)      ││
│  │ profile-mgmt  │ │ -generation  │ │durable-│ │policy-engine││
│  │ project-policy│ │              │ │run-str │ │registry pipe││
│  │               │ │              │ │registry│ │prompt-engine││
│  │               │ │              │ │-storage│ │             ││
│  └──────────────┘ └──────────────┘ └────────┘ └────────────┘│
└──────────────────────────────────────────────────────────────┘
```

**Frontend Operation** handles tool registration (root-entry) and the 17-phase execution lifecycle (runtime-core). The runtime-core orchestrator is the central hub, but it crosses into backend quadrants, which is a documented architectural concern.

**Backend Input** loads and validates configuration. Three modules: configuration (Zod schemas), profile-management (YAML frontmatter parser for `.profiles/*.md`), and project-policy (JSON loader for `.pi/efficiency-subagent/config.json`).

**Backend Output** generates structured artifacts. One primary module: run-artifact-generation (handoff.md and transcript.md builders).

**Backend Storage** owns all persistence. Two modules: durable-run-storage (run directories, JSONL event/tool logs) and registry-storage (JSONL-backed prompt registry with four O(1) in-memory indexes).

**Backend Computation** contains the policy engine, the full prompt registry pipeline (types, engine, composer), and the prompt-engine (slot/placeholder management).

### Execution Flow

The primary execution path runs top-down:

```
User invokes tool → root-entry validates params → profile/project config loaded
→ policy merged → prompt built (registry + slots + placeholders)
→ action loop (per-action: policy check → simulated tool)
→ transcript built → handoff written → storage persisted
```

---

## How to Invoke

The plugin registers one tool: `efficiency_subagent`.

### efficiency_subagent Invocation

Call it with these parameters:

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| `profile` | yes | string | Name of a profile defined under `.profiles/*.md` |
| `task` | yes | string | The task for the subagent to execute |
| `runId` | no | string | Resume a previous run by its ID |
| `actions` | no | array | Pre-defined action list (skips LLM planning) |

When you invoke with `profile` and `task`, the system loads the named profile's YAML frontmatter to determine: which tools are available, which placeholder values to register, which registry entries to activate, and what system prompt template to use. The `task` string becomes the user message to the subagent.

If you omit `runId`, a new run directory is created at `.pi/subagents/runs/{profile}-{task}-{timestamp}-{hexSuffix}/`. If you provide `runId`, the system resumes that run: it restores session metadata, slot state, and registry frequency counters from the existing run directory.

## Key Modules and When to Use Them

### Configuration (`config/`)
**What it does:** Defines all Zod schemas (ToolParams, ProfileFrontmatter, RegistryEntry, ProjectPolicy) and validates incoming parameters at the system boundary.
**When to interact:** If you're adding new tool parameters, you add a Zod schema here and wire validation in index.ts. If you're debugging a "parameter rejected" error, check `ToolParamsSchema` first.

### Profile Management (`config/profile-loader.ts`)
**What it does:** Finds, loads, and parses `.profiles/*.md` files. Uses a custom recursive-descent YAML parser for the frontmatter block. Returns typed `ProfileDefinition` objects.
**When to interact:** If you're creating or debugging a profile definition. Key function: `loadProfile(name)`.

### Project Policy (`config/project-loader.ts`)
**What it does:** Loads `.pi/efficiency-subagent/config.json` for project-level security rules. Returns `null` (allow all) when the file is missing or invalid.
**When to interact:** If you need to configure what a subagent can do at the project level (tool allowlists, path restrictions, network rules).

### Durable Run Storage (`storage/event-log.ts`)
**What it does:** Creates run directories, writes JSONL event/tool/session logs, reads events back, searches across runs, applies retention cleanup.
**When to interact:** If you need to read a previous run's events for analysis, or if you're building a monitoring tool. Key exports: `createRunDir()`, `readEvents()`, `appendEvent()`, `searchRuns()`.

### Run Artifact Generation (`storage/handoff-store.ts`, `storage/transcript-projector.ts`)
**What it does:** Produces `handoff.md` (machine-consumable continuation context) and `transcript.md` (human-readable event log).
**When to interact:** If you're consuming handoff documents across invocations, or if you need to modify the handoff format. Key exports: `writeHandoff()`, `buildTranscript()`, `buildJsonTranscript()`.

### Prompt Engine (`runtime/prompt-slots/engine.ts`)
**What it does:** Manages dynamic prompt content through three mechanisms: registry-based composition (primary), `{{name}}` placeholder replacement (legacy), and named slot prepending by priority (legacy). Maintains module-level mutable state with serialization support.
**When to interact:** If you need to understand prompt assembly or continuation state. Key exports: `setSlot()`, `pushSlot()`, `popSlot()`, `setOnceSlot()`, `registerPlaceholder()`, `renderPromptWithRegistry()`, `serializeSlots()`, `deserializeSlots()`.

### Policy Engine (`policy/`)
**What it does:** Merges multiple `PolicyEntry` sources into one `MergedPolicy`, then evaluates tool invocations across 7 dimensions: tool names, file paths (with glob support), bash commands, network domains/ports, env vars, nested subagent calls, and bash redirect targets.
**When to interact:** If you're configuring sandbox restrictions for a profile, or if you're debugging a "blocked by policy" error. Key exports: `mergePolicies()`, `evaluate()`.

### Runtime Core (`runtime/runner.ts`)
**What it does:** The central orchestrator. Executes runs: loads profiles, merges policies, renders prompts, runs the action loop with retry logic, builds transcripts and handoffs, persists state. Also handles run ID resolution and continuation consistency checks.
**When to interact:** If you're tracing the execution lifecycle, adding new lifecycle phases, or debugging why a run failed. Key export: `executeRun(ctx)`.

### Root Entry (`index.ts`)
**What it does:** Extension entry point. Registers the `efficiency_subagent` tool on the host's `ExtensionAPI`, validates parameters, resets slots, dispatches to `executeRun()`, and returns a compact summary plus structured run details.
**When to interact:** If you're changing the tool interface or adding new extension-level behaviors.

---

## Prompt Registry System

The Prompt Registry is a 3-layer system that manages a library of reusable prompt snippets (documentation, coding guidelines, tool instructions) and injects them into the agent's context on demand.

### Three Layers

**Layer 1: registry-storage** — Persistent JSONL storage with four O(1) in-memory indexes (by ID, name, tag, group). Each entry has fields for content, filePath, priority, lifecycle scheduling, and frequency limits. Tracks per-entry sliding-window call frequency.

**Layer 2: registry-engine** — Contains two subsystems:
- **ScheduleOrchestrator**: A stateful, mutable scheduler exposed as LLM-callable tool methods. The LLM can `scheduleTags`, `scheduleIds`, `scheduleGroups`, `unschedule`, and query current state. This is the interface the subagent LLM uses to request relevant documentation.
- **Resolution pipeline**: A 5-stage stateless pipeline that processes the schedule state: Collect (expand tags/groups to IDs), Dedup (unique by ID), Filter (check lifecycle activity and frequency limits), Sort (by priority descending), Load (inline content or read from disk).

**Layer 3: registry-composer** — Assembles the final prompt in three sections: a Table of Contents (markdown table of all available entries), injected entry bodies (currently scheduled ones, priority-ordered), and the base prompt with `{{name}}` placeholders resolved to entry content.

### How Entries Flow

```
Registration (profile YAML or code) → registry-storage (JSONL + indexes)
  → LLM schedules via orchestrator tool → ScheduleState
  → registry-engine resolves (Collect→Dedup→Filter→Sort→Load) → ResolvedEntry[]
  → registry-composer composes (ToC + injected entries + placeholder-resolved prompt)
  → Final prompt delivered to LLM
```

### When an LLM Should Use Schedule Tools

If you're the subagent LLM and you see a "ToC" section listing available documentation entries, call the orchestrator's `scheduleTags`, `scheduleIds`, or `scheduleGroups` methods to request the entries relevant to your current task. The system will inject their full content into your prompt on the next turn. Use `unschedule` to remove entries you no longer need.

---

## Removed Lifecycle Script System

Lifecycle scripts are no longer part of this project. Tool execution is controlled by explicit action parameters and the policy engine. Prompt/context injection is handled by profile placeholders and the Prompt Registry.

---

## Policy System

### What Policies Control

Policies define what a subagent is allowed to do. They are evaluated on every tool invocation (before the tool actually executes). The 7 dimensions checked are:

1. **Tool name allowlisting**: Which tool names are permitted
2. **File path restrictions**: Glob-based path matching with exclusions
3. **Bash command filtering**: Exact, prefix, and glob-to-regex command matching
4. **Bash path extraction**: Catches redirect targets and path arguments
5. **Network access**: Domain, port, and scheme restrictions
6. **Environment variable access**: Allow/deny lists
7. **Nested subagent calls**: Whether `efficiency_subagent` can be called recursively

### How Policy Resolution Works

Policies come from two sources: profile definitions (in YAML frontmatter) and project config (`.pi/efficiency-subagent/config.json`). The `mergePolicies()` function unions them into a single `MergedPolicy`. The `evaluate()` function then checks each tool invocation's `ActionContext` against the merged policy and returns an allow/deny decision with a reason string.

Missing or invalid project policy gracefully degrades to `null`, which means "allow everything." Profile-level policies always take effect.

### How to Configure

In profile YAML, define policies under a `policy` key. In project config JSON, define a `policies` array of `PolicyEntry` objects. Both use the same `PolicyEntry` shape with fields like `allowTools`, `denyTools`, `allowPaths`, `denyPaths`, `allowBash`, `denyBash`, `allowDomains`, `denyDomains`, `allowEnv`, `denyEnv`.

---

## Session Continuity

### How runId Works

Every invocation produces a run ID. The naming scheme is `{profileName}-{taskSlug}-{ISOtimestamp}-{6-char-hex-suffix}`. This ensures uniqueness while remaining human-readable.

When you provide a `runId` parameter, the system:
1. Validates the run directory exists
2. Restores session metadata from `session.json`
3. Deserializes slot state from `slots.json` (slot values, stacks, placeholders, TTL info)
4. Restores registry frequency counters so usage limits carry over
5. Checks that the profile name matches (consistency check)

The subagent then continues as if it never stopped, with full context from the previous run.

### Handoff Format

After each run completes, the system writes a `handoff.md` file to the run directory. This file contains structured sections:

- **Run metadata**: runId, profile name, task, status, timestamps
- **Files touched**: list of files modified during the run
- **Tool usage summary**: counts per tool, success/failure rates
- **Artifacts produced**: paths to generated files
- **Block context**: what the subagent was doing when it stopped, including the last action and any policy blocks encountered

The handoff is designed to be read by the LLM on the next invocation. Pass it as context to continue seamlessly.

### Resuming Runs

To resume a run: invoke `efficiency_subagent` with `profile` set to the same profile, `task` describing the continuation (e.g., "Continue previous work"), and `runId` set to the previous run's ID. The system restores all state and the LLM receives the handoff content.

---

## Common Patterns

### Typical Workflow

1. **Create a profile** in `.profiles/worker.md` with YAML frontmatter defining tools, placeholders, registry entries, and the prompt body.
2. **Configure project policy** (optional) in `.pi/efficiency-subagent/config.json` to restrict what the subagent can do.
3. **Invoke the subagent**: call `efficiency_subagent` with `profile: "worker"` and `task: "do X"`.
4. **Read the handoff**: after the run, check `.pi/subagents/runs/{runId}/handoff.md` for the structured summary.
5. **Continue**: invoke again with `runId` to resume where it left off.
6. **Review**: read `transcript.md` for human-readable event logs, or `events.jsonl` for machine-readable data.

### Profile Authoring Pattern

A profile markdown file has two sections: YAML frontmatter (between `---` markers) and a markdown body. The frontmatter declares the subagent's tool list, placeholder values, and registry entries. The body serves as additional context. Example structure:

```yaml
name: worker
description: General-purpose subagent
systemPrompt: "You are a helpful coding assistant."
tools: [read, write, bash, glob, grep]
placeholders:
  workspace: "/home/user/project"
registry:
  - name: coding-guidelines
    type: guideline
    priority: 10
    content: "Always write tests first."
```

## Important Constraints

### No OS Sandbox

The plugin does not provide OS-level or container-level sandboxing. It runs inside the PI Coding Agent's extension system, which means it inherits the host process's permissions. The policy engine provides **logical** sandboxing (blocking tool calls, paths, network access, etc.), but this is a soft boundary. Do not rely on it for security isolation against a malicious payload.

### Tool Allowlists

Subagents only have access to tools listed in their profile's `tools` array. If a tool is not in the allowlist, it cannot be called. The policy engine may further restrict access even for allowed tools (e.g., deny specific file paths or bash commands).

### File Path Restrictions

All file operations (reads, writes, globs, grep) are constrained by path policies. Paths are matched against glob patterns (`*`, `**`) with explicit exclusions taking precedence over inclusions. The working directory is always the project root specified at invocation time.

### No Multi-Agent Workflow Orchestration

This is a single-profile, single-run system. There is no planner-router graph, no multi-agent orchestration, and no DAG-based workflow execution. For multi-step pipelines, invoke the subagent multiple times with `runId` to chain runs.

### No Bundled Profiles

The plugin ships with no built-in profiles. All profiles must be created by the user in `.profiles/*.md`.

### Extension-Only Deployment

The plugin is loaded as a PI Coding Agent extension via symlink or `--extension` flag. It is not a standalone binary, npm package, or Docker image. It depends on the host's `@earendil-works/pi-coding-agent` API.

### Deterministic Run ID Naming

Run IDs use a truncated SHA-256 hash of the full name to ensure uniqueness. Do not parse run IDs for meaning beyond the profile name and approximate timestamp. The hex suffix is not a sequence number.

### Slot State is Module-Level Mutable

The prompt-engine maintains mutable module-level state (slots, stacks, placeholders, event log). This means slot state persists across multiple invocations within the same process lifetime. Call `reset()` at the start of each tool invocation to clear stale state, or use `serializeSlots()`/`deserializeSlots()` for explicit lifecycle control.

---

## Further Reading

- **L2 module docs**: `docs/L2-modules/` — Detailed module-level documentation with full API surfaces
- **L3 architecture docs**: `docs/L3-architecture/` — Layer classification and boundary analysis
- **L1 file docs**: `docs/L1-files/` — Per-file source-level documentation with line references

For the full API surface of any module, read the corresponding L2 doc. For architectural reasoning about why modules are classified as they are, read the L3 docs.
