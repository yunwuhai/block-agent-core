# L3 Architecture: Runtime Layer

## Purpose

The runtime layer wraps the core assembly pipeline with I/O operations, process lifecycle management, and the MountController API for dynamic context adjustment.

## Components

### RegistryStore (`runtime/registry-store.ts`)
- JSONL persistence: loads Registry from disk; saves via atomic write
- Manages three files: registry.jsonl, registry-calls.jsonl, capabilities.jsonl
- Rebuilds round counters from call history on load

### RunLifecycle (`runtime/run.ts`)
- Full run lifecycle: create new run or continue existing
- Delegates to: Pipeline (assembly), Composer (prompt), Policy (permission), MountController (context adjustment)
- Produces: events.jsonl, handoff.md, transcript.md, session.json

### MountController (`runtime/actions.ts`)
- LLM-callable: mount, unmount, view
- Stateful: accumulates context requests, tracks transient entries
- Each mutation re-resolves the pipeline

### Output Formatters (`runtime/output.ts`)
- Pure string builders: handoff.md (YAML + assembly summary) and transcript.md (chronological event log)
- No I/O — the storage layer writes the strings to disk

## Data Flow

```
RegistryStore.load() → Registry (in-memory)
  │
RunLifecycle.create()
  ├─ MountController.mount(request)
  │   └─ Pipeline.resolve()
  │       └─ ContextAssembly
  ├─ Composer.compose(assembly, prompt)
  │   └─ FinalPrompt
  ├─ executeActionLoop(actions)
  │   └─ events[]
  └─ Output formatters
      └─ handoff.md + transcript.md
  │
RegistryStore.save() → disk
```

## Separation from Core

The runtime layer depends on core; core never depends on runtime. This means:
- Core can be imported and tested without any filesystem setup
- Runtime can be swapped out (e.g., different storage backends)
- The pipeline is a pure function — fully testable with mock Registry instances
