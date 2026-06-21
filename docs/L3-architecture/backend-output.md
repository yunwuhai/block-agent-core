# L3 Architecture: Backend — 输出 (Output)

Layer for modules that produce, format, and persist outgoing artifacts — handoff documents, transcripts, and structured output.

> **Quadrant definition:** Modules that produce/persist outgoing artifacts (handoff generation, transcript building, event logging).

## Member Modules

| # | Module | Primary | Description | L2 Doc |
|---|--------|---------|-------------|--------|
| 1 | `run-artifact-generation` | 输出 | Produce structured handoff markdown documents and human-readable transcripts from raw run event data. | [run-artifact-generation.md](../L2-modules/run-artifact-generation.md) |

### Secondary Output Modules

These modules have output as a **secondary** classification:

| Module | Primary | Output Role | L2 Doc |
|--------|---------|-------------|--------|
| `registry-composer` | 计算 | Assembles the final LLM prompt message — a text artifact consumed as output to the LLM | [registry-composer.md](../L2-modules/registry-composer.md) |
| `runtime-core` | 操作 | Generates handoff documents and transcripts (boundary violation — see [_bugs.md](./_bugs.md)) | [runtime-core.md](../L2-modules/runtime-core.md) |

---

## Module Detail: `run-artifact-generation`

**Purpose:** Produce structured, formatted output artifacts from raw run event data — handoff markdown documents for session continuity across subagent invocations, and human-readable transcripts for review and debugging.

### Member L1 Files

| L1 Doc | Summary |
|--------|---------|
| `storage-handoff-store.md` | Defines `HandoffBlock` (run metadata, summary, files touched, tool usage, artifacts, block context) and `writeHandoff()` which assembles a rich `.handoff.md` markdown document from a `RunDirectory` + `HandoffBlock`. |
| `storage-transcript-projector.md` | Defines `TranscriptView` (markdown string) and `buildTranscript()` / `buildJsonTranscript()` — reads events via `readEvents()` from the event log, formats each event variant (`run_start`, `tool_call`, `hook_exec`, `policy_block`, etc.) as markdown sections, and returns a readable transcript. |

### Key Exports

- `HandoffBlock` — Structured metadata: `{runId, profileName, task, status, filesTouched, toolSummary, artifacts, blockContext, ...}`
- `writeHandoff(run: RunDirectory, block: HandoffBlock): Promise<void>` — Writes `.handoff.md` to the run directory
- `TranscriptView` — Markdown string type alias
- `buildTranscript(run: RunDirectory, options?: TranscriptOptions): Promise<TranscriptView>` — Builds human-readable markdown transcript
- `buildJsonTranscript(run: RunDirectory, options?: TranscriptOptions): Promise<TranscriptView>` — JSON-formatted transcript variant
- `TranscriptOptions` — `{maxOutputLength: number}` (default truncation; `-1` for unlimited)

### Data Flow

```
Raw events (events.jsonl)
        │
        ▼
  readEvents() — from Durable Run Storage
        │
        ├──────────────────────────┐
        ▼                          ▼
  buildTranscript()          writeHandoff()
  (Markdown sections          (HandoffBlock → .handoff.md
   per event type)             with collapsible <details>)
        │                          │
        ▼                          ▼
  transcript.md               handoff.md
  (human review)              (machine-consumable context
                               for next invocation)
```

### Why This Classification

`run-artifact-generation` is the **purest output module**. It takes raw event data produced during a run and transforms it into two distinct output artifacts:
- **Handoff** — machine-consumable structured context for session continuity
- **Transcript** — human-readable documentation for review and debugging

Both files follow the same architectural pattern: consume a `RunDirectory` (or its event data), transform into formatted output, write or return the result. Neither file performs storage management (they read from Durable Run Storage but don't own it), nor do they perform computation beyond formatting/transformation.

**Note on file location:** Despite residing under `storage/` in the source tree, this module is classified as 输出 based on its **purpose**, not its directory. It produces artifacts; it does not manage the storage layer itself.

---

## Layer Position in Architecture

```
┌──────────────────────────────────────────────────┐
│                  BACKEND                          │
│  ┌──────┐ ┌──────────────────────┐                │
│  │ 输入  │ │  输出 (Output)        │                │
│  └──────┘ │  run-artifact-gen    │                │
│           │  (+ registry-composer│                │
│           │   secondary)         │                │
│           └──────────────────────┘                │
│  ┌─────────┐ ┌──────────────────────────────────┐ │
│  │ 存储     │ │ 计算                              │ │
│  └─────────┘ └──────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

The 输出 layer is the **artifact generation surface** — it consumes raw data from the storage and computation layers and produces structured, formatted, persistable output artifacts. All output modules are consumers of data, not producers; they read from storage and computation and write formatted output.
