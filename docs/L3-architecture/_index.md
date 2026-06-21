# L3 Architecture: Overview

This project is organized around two current capabilities:

1. **Subagent parameter control**: profiles, model/tool/permission parameters, project policy, explicit action sequences, and registry entries.
2. **Durable conversation scheduling**: prompt placeholders, Prompt Registry scheduling/resolution, JSONL event/session/tool logs, transcripts, handoff artifacts, and search.

## Layer Diagram

```
FRONTEND
└── Operation: root-entry, runtime-core

BACKEND
├── Input: configuration, profile-management, project-policy
├── Computation: policy-engine, prompt-engine, registry-types, registry-engine, registry-composer
├── Storage: durable-run-storage, registry-storage
└── Output: run-artifact-generation
```

## Primary Execution Flow

```
user call
  └── root-entry
        └── runtime-core
              ├── input: load profile + project policy
              ├── computation: merge policy + render prompt + resolve registry
              ├── operation: execute explicit actions
              ├── storage: append session/events/tools JSONL
              └── output: build transcript + handoff
```

## Prompt Composition Flow

```
prompt-engine
  └── registry-composer
        ├── ToC table of available entries
        ├── scheduled entry injection
        └── placeholder replacement
```

## Current Module Count

| Layer | Count | Modules |
|---|---:|---|
| Frontend Operation | 2 | `runtime-core`, `root-entry` |
| Backend Input | 3 | `configuration`, `profile-management`, `project-policy` |
| Backend Computation | 5 | `registry-types`, `registry-engine`, `registry-composer`, `prompt-engine`, `policy-engine` |
| Backend Storage | 2 | `durable-run-storage`, `registry-storage` |
| Backend Output | 1 | `run-artifact-generation` |

## Removed Boundary

Lifecycle scripts and frontend display rendering are no longer part of this architecture. Tool behavior is controlled by explicit actions plus policy evaluation. Context injection is controlled by profile placeholders, dynamic slots, and registry scheduling. User-visible run history comes from durable logs, transcript, and handoff artifacts.
