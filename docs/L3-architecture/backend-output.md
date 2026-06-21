# L3 Architecture: Backend — 输出 (Output)

Backend output modules transform run data into artifacts consumed by humans, future invocations, or automation.

## Member Modules

| # | Module | Primary | Description | L2 Doc |
|---|--------|---------|-------------|--------|
| 1 | `run-artifact-generation` | 输出 | Produces structured handoff markdown and human-readable transcripts from run events. | [run-artifact-generation.md](../L2-modules/run-artifact-generation.md) |

## Artifact Flow

```
events.jsonl + tools.jsonl + session.jsonl
        │
        ├── buildTranscript() ──► transcript.md
        └── writeHandoff() ─────► .handoff.md
```

The output layer formats existing run facts. It does not mutate execution state or decide policy.
