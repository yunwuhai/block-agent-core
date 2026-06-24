# L1 -- `backend/runtime/output.ts`

**Purpose:** Handoff and transcript formatting functions. Produces human-readable markdown: handoff.md (YAML frontmatter with run metadata, context assembly summary, mounted/excluded entry tables, files touched, tool call summary, block context, next-steps) and transcript.md (chronological event log). Pure formatting — no I/O, just string builders.

**Lines:** 545

## Exports

| Export | Kind | Lines | Description |
|---|---|---|---|
| `buildHandoff` | function | 31--51+ | Builds handoff.md markdown from Run + Event[] + ContextAssembly. Returns `string`. |
| `buildTranscript` | function | ~260--545 | Builds transcript.md markdown from Run + Event[]. Returns `string`. |

## Handoff Format

```markdown
---
runId: {id}
profile: {profile}
task: {task}
status: {status}
startTime: {startTime}
isContinuation: {true/false}
---

## Context Assembly Summary
- **Mounted**: N entries (N tokens)
- **Excluded**: N entries
- **Pool**: N available entries
- **Budget Used**: N%

## Mounted Entries
| Name | Reason | Tokens | Capabilities |
|------|--------|--------|-------------|

## Excluded Entries
| Name | Reason | Detail |
|------|--------|--------|

## Files Touched
(extracted from tool_call events)

## Tool Call Summary
| Tool | Count | Status |
|------|-------|--------|

## Block Context
(key decisions and blocking context from this run)

## Next Steps
(suggestions for continuation based on run state)
```

## Transcript Format

```markdown
# Transcript: {runId}

## Run Start ({timestamp})
Profile: {profile}
Task: {task}

## [Event Log]

### {HH:MM:SS} Tool Call: {tool}({args})
→ {result} or ⛔ BLOCKED: {reason}

### {HH:MM:SS} Context Mounted: {name}
Reason: {reason}, N tokens

### {HH:MM:SS} Context Unmounted: {name}

## Run End ({timestamp})
Status: {status}
```

## Internal Helpers

| Symbol | Description |
|---|---|
| `escapePipe()` | Escapes `\|` characters in markdown table cells |
| `extractFilesTouched()` | Scans events for tool_call events, extracts file paths |
| `mapToolToOperation()` | Maps tool name to operation string (read/write/execute) |

## Notes

- **Pure formatting**: No I/O. The actual file writing is handled by `storage/` modules that call these functions.
- **Handoff YAML frontmatter**: Machine-parseable, enables automated continuation decisions by external orchestration systems.
- **Assembly included**: Handoff now includes full Context Assembly Summary — critical for the external orchestrator's "decide → execute → observe → re-decide" loop.
