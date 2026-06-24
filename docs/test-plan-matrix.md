# Test Plan Matrix -- efficiency-subagent

## Module: `core/types.ts`

| ID | Test | Input | Expected | Category |
|----|------|-------|----------|----------|
| T1.1 | Entry shape completeness | Various Entry literals | Compiles, all fields present at access | Compile-time |
| T1.2 | EntryInput default resolution | Minimal input argument | Compiles, destructure with defaults | Compile-time |
| T1.3 | ContextRequest shape | `{want:{capabilities:["a"]}}` | Compiles, discriminated unions work | Compile-time |
| T1.4 | Lifecycle union narrowing | Switch on `entry.lifecycle.type` | Exhaustiveness check passes | Compile-time |
| T1.5 | FinalPrompt section order | `sections: PromptSection[]` | Index 0=toc,1=injected,2=context | Compile-time |

**Note:** Types only -- no runtime tests needed. Compile-time verification via `tsc --noEmit`.

---

## Module: `core/registry.ts`

| ID | Test | Input | Expected | Category |
|----|------|-------|----------|----------|
| R1.1 | add + get roundtrip | `add(entry)`, `get(id)` | Same entry returned | CRUD |
| R1.2 | get non-existent | `get("noid")` | `undefined` | CRUD |
| R1.3 | remove existing | `remove(id)` | `true`, entry no longer gettable | CRUD |
| R1.4 | remove non-existent | `remove("noid")` | `false` | CRUD |
| R1.5 | update existing fields | `update(id, {content:"new"})` | `true`, get returns updated content | CRUD |
| R1.6 | update non-existent | `update("noid", {})` | `false` | CRUD |
| R1.7 | Content-hash dedup: same content | Two `add({content:"abc",...})` | Same ID returned, size=1 | Dedup |
| R1.8 | Content-hash dedup: different content | Two `add({content:"abc"})` + `add({content:"xyz"})` | Different IDs, size=2 | Dedup |
| R1.9 | Content-hash dedup: explicit ID same | `add({id:"a",...})` twice | Idempotent, size=1 | Dedup |
| R1.10 | findByName | `add({name:"foo"})`, `getByName("foo")` | Correct entry | Query |
| R1.11 | findByName non-existent | `getByName("nope")` | `undefined` | Query |
| R1.12 | findByCapability | `add({capabilities:["fs-read"]})`, `findByCapability("fs-read")` | Array with 1 entry | Query |
| R1.13 | findByCapability empty | `findByCapability("unknown")` | `[]` | Query |
| R1.14 | findByTags any-match | `add({tags:["a","b"]})`, `add({tags:["b","c"]})`, `findByTags(["a","c"],"any")` | Both entries | Query |
| R1.15 | findByTags all-match | `add({tags:["a","b"]})`, `add({tags:["a"]})`, `findByTags(["a","b"],"all")` | Only entry with both tags | Query |
| R1.16 | findByTags empty | `findByTags([],"any")` | `[]` | Query |
| R1.17 | findByGroup | `add({group:"g1"})`, `add({group:"g2"})`, `findByGroup("g1")` | Only group g1 entries | Query |
| R1.18 | findByGroup empty | `findByGroup("none")` | `[]` | Query |
| R1.19 | Transient vs persistent tracking | `add(e1,"persistent")`, `add(e2,"transient")` | `listPersistent()` includes e1 not e2, `listTransient()` includes e2 | Lifecycle |
| R1.20 | importPersistent bulk load | `importPersistent([e1,e2])` | Both indexed, not transient | Lifecycle |
| R1.21 | Index consistency after remove | Add 2 entries, remove 1 | nameIndex/capabilityIndex/tagIndex/groupIndex cleaned up | Consistency |
| R1.22 | Index consistency after update | Add with tag "a", update to tag "b" | tagIndex has "b" not "a" | Consistency |
| R1.23 | advanceRound / getRoundCount | `advanceRound(id)`, `getRoundCount(id)` | 1, then 2 after second advance | Lifecycle |
| R1.24 | exportPersistent excludes transient | 1 persistent + 1 transient | Only persistent in export | Serialization |
| R1.25 | exportTransient returns correct | 1 transient | Only transient in export | Serialization |
| R1.26 | size after mutations | add 3, remove 1 | size = 2 | Metrics |

---

## Module: `core/pipeline.ts`

| ID | Test | Input | Expected | Category |
|----|------|-------|----------|----------|
| P1.1 | Basic: 1 entry by capability | 1 entry declares cap "a", request `{want:{capabilities:["a"]}}` | Mounted: 1, Excluded: 0, Pool: 0 | Happy path |
| P1.2 | Basic: 1 entry by entryId | 1 entry, request `{want:{entryIds:["id1"]}}` | Mounted: 1 | Happy path |
| P1.3 | Basic: 1 entry by tag | 1 entry with tag "t1", request `{want:{tags:["t1"]}}` | Mounted: 1 | Happy path |
| P1.4 | Capability expansion | 2 entries declare cap "a", request cap "a" | Mounted: 2 | Capability |
| P1.5 | Depends: simple chain | A depends on B, request A | Both A and B mounted, B reason=dependency | Depends |
| P1.6 | Depends: diamond | A depends B,C; B,C depend D; request A | All mounted once each | Depends |
| P1.7 | Depends: cycle detection | A depends B, B depends A, request A | `CycleError` thrown | Depends |
| P1.8 | Depends: missing dep | A depends on missing ID, request A | A excluded with reason "missing-dep" | Depends |
| P1.9 | Conflicts: different priority | A conflicts with B, A.pri=80, B.pri=20, request both | A mounted, B excluded "conflict" | Conflicts |
| P1.10 | Conflicts: equal priority | A conflicts with B, same pri, request both | First collected mounted, second excluded | Conflicts |
| P1.11 | Lifecycle: permanent | permanent entry | Always mounted | Lifecycle |
| P1.12 | Lifecycle: rounds expired | `rounds` with maxRounds=5, context round=10 | Excluded "lifecycle" | Lifecycle |
| P1.13 | Lifecycle: rounds active | `rounds` maxRounds=5, context round=3 | Mounted | Lifecycle |
| P1.14 | Lifecycle: time-window active | time-window covering current time | Mounted | Lifecycle |
| P1.15 | Lifecycle: time-window expired | time-window in the past | Excluded "lifecycle" | Lifecycle |
| P1.16 | Frequency: maxTotal exceeded | 5 calls, maxTotal=5 | Excluded "frequency" | Frequency |
| P1.17 | Frequency: maxTotal not exceeded | 3 calls, maxTotal=5 | Mounted | Frequency |
| P1.18 | Frequency: maxPer100 exceeded | 6 calls in last 50 distinct rounds, maxPer50=5 | Excluded "frequency" | Frequency |
| P1.19 | Frequency: no limits | 100 calls, no frequency config | Mounted (no caps) | Frequency |
| P1.20 | Budget: within limit | 2 entries 50+50 tokens, maxTokens=200 | Both mounted | Budget |
| P1.21 | Budget: token overflow | 2 entries 100+100 tokens, maxTokens=150 | First mounted, second excluded "budget" | Budget |
| P1.22 | Budget: entry count overflow | 3 entries, maxEntries=2 | First 2 mounted, third excluded | Budget |
| P1.23 | Budget: pinned bypass | 2 entries (1 pinned), maxTokens=50, pinned=100t | Pinned mounted, other excluded | Budget |
| P1.24 | Empty request | `{want:{}}` | mounted=[], pool=registry entries | Empty |
| P1.25 | Empty registry | request `{want:{tags:["x"]}}`, empty registry | mounted=[], pool=[] | Empty |
| P1.26 | Combined: caps + tags + ids with dedup | Same entry matched by cap + tag + id | Mounted once | Combined |
| P1.27 | MountReason assignment | Request by capability, dependency, tag, pinned | Correct reason per entry | Metadata |
| P1.28 | enforceFrequency=false | entry exceeds all caps, `enforceFrequency:false` | Mounted (frequency skipped) | Config |

---

## Module: `core/composer.ts`

| ID | Test | Input | Expected | Category |
|----|------|-------|----------|----------|
| C1.1 | 1 mounted entry | assembly with 1 inline entry, base prompt | Injected section has entry content | Basic |
| C1.2 | Empty assembly | assembly with empty mounted/pool, base prompt | ToC: "no additional entries", Injected: "no context entries" | Basic |
| C1.3 | {{name}} resolved from mounted | base: `"do {{x}}"`, mounted entry name="x" | Context: `"do <content>"` | Placeholder |
| C1.4 | Unknown {{name}} | base: `"do {{missing}}"`, not in mounted or pool | Context: `"do [entry not mounted: missing]"` | Placeholder |
| C1.5 | {{name}} in pool only | base: `"do {{in-pool}}"`, pool entry name="in-pool" | `"do {{in-pool}}"` + availability hint appended | Placeholder |
| C1.6 | Multiple {{name}} | base: `"do {{a}} and {{b}}"`, both mounted | Both replaced | Placeholder |
| C1.7 | No placeholders | base with no `{{}}` | Context unchanged, no hints | Placeholder |
| C1.8 | Metrics passthrough | assembly with metrics | compose() returns same metrics in FinalPrompt | Metrics |
| C1.9 | ToC table formatting | 2 pool entries | Markdown table with all columns | Formatting |
| C1.10 | Injected sort order: pinned first | 2 entries (1 pinned, 1 cap), pinned has lower priority | Pinned rendered first | Sorting |
| C1.11 | Placeholder in non-mounted pool | name in pool, not mounted | `[available: request "..."]` hint appended | Availability |

---

## Module: `core/capability.ts`

| ID | Test | Input | Expected | Category |
|----|------|-------|----------|----------|
| K1.1 | declare + get | `declare({name:"a",description:"..."})`, `get("a")` | Capability returned | CRUD |
| K1.2 | declare overwrites existing | `declare(a)`, `declare(a with desc2)` | get returns updated description | CRUD |
| K1.3 | get non-existent | `get("none")` | `undefined` | CRUD |
| K1.4 | has | `has("a")` after declare | `true` / `false` | CRUD |
| K1.5 | list | `declare(a)`, `declare(b)`, `list()` | Both in array | CRUD |
| K1.6 | remove | `declare(a)`, `remove("a")`, `has("a")` | `true`, then `false` | CRUD |
| K1.7 | Implies: simple | A implies [B], B declared, `expand(["A"])` | `["A","B"]` | Implies |
| K1.8 | Implies: chain | A implies B, B implies C, `expand(["A"])` | `["A","B","C"]` | Implies |
| K1.9 | Implies: cycle detection | A implies B, B implies A | `CircularImpliesError` thrown | Implies |
| K1.10 | getDefaultEntries | `declare({defaultEntryIds:["x","y"]})` | `["x","y"]` | Defaults |
| K1.11 | getDefaultEntries non-existent | `getDefaultEntries("none")` | `[]` | Defaults |
| K1.12 | Name validation: valid | `"fs-read"`, `"a"`, `"code-review"` | No throw | Validation |
| K1.13 | Name validation: invalid | `"-leading"`, `"trailing-"`, `"UPPER"`, `""` | `InvalidCapabilityNameError` | Validation |
| K1.14 | MissingImpliedCapabilityError | `declare({implies:["undeclared"]})` | Error thrown | Validation |
| K1.15 | List returns copies | `list()`, mutate returned array | Registry unchanged | Safety |

---

## Module: `runtime/registry-store.ts`

| ID | Test | Input | Expected | Category |
|----|------|-------|----------|----------|
| S1.1 | Load from existing JSONL | registry.jsonl with 3 valid lines | 3 entries loaded, errors=[] | Load |
| S1.2 | Load from empty file | registry.jsonl empty | 0 entries, errors=[] | Load |
| S1.3 | Load non-existent file | no registry.jsonl | 0 entries, errors=[] | Load |
| S1.4 | Parse errors: skip bad lines | 2 valid + 1 malformed line | 2 entries loaded, 1 error in array | Load |
| S1.5 | Save with atomic write | registry with 2 entries | registry.jsonl has 2 lines, .tmp cleaned up | Save |
| S1.6 | Load/save roundtrip | add entry, save, new store.load() | Same entry returned | Roundtrip |
| S1.7 | loadCapabilities from file | capabilities.jsonl with 2 caps | 2 capabilities loaded | Capabilities |
| S1.8 | loadCapabilities empty/missing | no capabilities.jsonl | empty registry, errors=[] | Capabilities |
| S1.9 | saveCapabilities atomic write | 1 capability | Written atomically with .tmp | Capabilities |
| S1.10 | appendCallLog increments rounds | 2 calls for same entryId | round=1, then round=2 | Call log |
| S1.11 | loadFrequencyState grouping | 3 calls across 2 entryIds | Map with 2 entries, each with correct calls | Call log |
| S1.12 | createProjectPaths | `createProjectPaths("/project")` | `baseDir=/project/.subagent`, registry/calls/capabilities paths correct | Paths |

---

## Module: `runtime/run.ts` (RunLifecycle)

| ID | Test | Input | Expected | Category |
|----|------|-------|----------|----------|
| L1.1 | Create run | profile + task + cwd | RunResult with status, handoffPath, transcriptPath, id | Create |
| L1.2 | Create creates directory | valid config | Run directory exists under runs root | Artifacts |
| L1.3 | Create writes session.json | valid config | session.json has runId, profile, status | Artifacts |
| L1.4 | Action loop processes tool_calls | 3 tool_call actions | 3 tool_call events in log | Actions |
| L1.5 | Action loop handles schedule | {type:"schedule",tags:["t"]} | schedule event logged, 0 mounted (no matching) | Actions |
| L1.6 | Continue run | First create, then continue with runId | `RunResult`, events include run_continue | Continue |
| L1.7 | Continue: non-existent runId | fake runId | Error thrown "directory not found" | Continue |
| L1.8 | Continue: profile mismatch | different profile on continue | profile_mismatch event logged | Continue |
| L1.9 | Run ID format | profile="worker", task="fix bugs" | ID matches `worker-fix-bugs-...` | Identity |
| L1.10 | Error -> status failed | non-existent profile | status="failed", artifacts still produced | Error |
| L1.11 | Artifact generation: handoff | completed run | handoff.md readable, has YAML frontmatter | Artifacts |
| L1.12 | Artifact generation: transcript | completed run | transcript.md readable, chronological events | Artifacts |
| L1.13 | Registry persistence on create | run with profile entries | registry.jsonl updated on disk | Persistence |
| L1.14 | Slot persistence and restore | create, set slot, continue | slot content restored | Slots |

---

## Module: `runtime/actions.ts` (MountController)

| ID | Test | Input | Expected | Category |
|----|------|-------|----------|----------|
| A1.1 | Mount by capability | `mount({capabilities:["a"]})` | Assembly includes matching entries | Mount |
| A1.2 | Mount by entryId | `mount({entryIds:["id1"]})` | Specific entry mounted | Mount |
| A1.3 | Mount with transient entries | `mount({entries:[EntryInput]})` | Entry added as transient, mounted | Mount |
| A1.4 | Mount with combined spec | caps + ids + tags + entries | All matched entries mounted, dedup | Mount |
| A1.5 | Mount empty spec | `mount({})` | Re-resolves current request | Mount |
| A1.6 | Unmount by entryId | mount then unmount entryId | Entry removed from mounted, transient cleaned | Unmount |
| A1.7 | Unmount non-existent | `unmount({entryIds:["noid"]})` | No-op, no error | Unmount |
| A1.8 | View mounted/available/full | after mount | Correct subsets returned | View |
| A1.9 | Multiple mounts accumulate | mount A, mount B | Both in assembly | Accumulate |
| A1.10 | Mount then unmount cycle | mount A, unmount A, mount A | A in final assembly | Cycle |
| A1.11 | getSchedule / setSchedule roundtrip | get, set same request | Same assembly produced | Serialization |
| A1.12 | processAction: schedule | `{type:"schedule",tags:["t"]}` | Delegates to mount() | Adapter |
| A1.13 | processAction: unschedule | `{type:"unschedule",entryIds:["id"]}` | Delegates to unmount() | Adapter |
| A1.14 | processAction: unknown | `{type:"unknown"}` | Error thrown | Adapter |

---

## Module: `runtime/output.ts`

| ID | Test | Input | Expected | Category |
|----|------|-------|----------|----------|
| O1.1 | buildHandoff: all sections | mock run + events + assembly | YAML frontmatter + mounted table + excluded table + files + tool summary + next steps | Structure |
| O1.2 | buildHandoff: empty assembly | mock run + events, empty assembly | All sections present but empty counts | Edge |
| O1.3 | buildHandoff: zero entries | empty mounted, excluded, pool | "0 entries" in summary | Edge |
| O1.4 | buildTranscript: event order | events: run_start, tool_call, tool_result, run_end | Chronological with timestamps | Structure |
| O1.5 | buildTranscript: policy_block | tool_call followed by policy_block | "BLOCKED" rendered in transcript | Structure |
| O1.6 | buildTranscript: schedule event | schedule event | "Context Mounted" rendered | Structure |
| O1.7 | buildTranscript: empty run | only run_start and run_end | Valid transcript without errors | Edge |

---

## Module: `storage/event-log.ts`

| ID | Test | Input | Expected | Category |
|----|------|-------|----------|----------|
| E1.1 | append + read roundtrip | 1 event | Same event returned | IO |
| E1.2 | Multiple events preserve order | 3 events appended in sequence | Same order on read | Ordering |
| E1.3 | writeSession + readSession | session data with 3 fields | Same data returned | Session |
| E1.4 | readSession non-existent | nonexistent dir | `null` | Session |
| E1.5 | Malformed lines skipped | events.jsonl with 1 good + 1 bad line | 1 event read | Robustness |
| E1.6 | sessionExists: exists | after writeSession | `true` | Session |
| E1.7 | sessionExists: not exists | non-existent dir | `false` | Session |
| E1.8 | readEvents non-existent | nonexistent file | `[]` | Edge |

---

## Module: `storage/run-artifacts.ts`

| ID | Test | Input | Expected | Category |
|----|------|-------|----------|----------|
| F1.1 | createRunDir | cwd + runId | Directory created with events.jsonl, session.json | Create |
| F1.2 | createRunDir reuses existing | same runId twice | No error, directory reused | Create |
| F1.3 | listRunIds | 2 runs created | Both IDs returned | List |
| F1.4 | listRunIds with filter | 2 runs, filter profile="a" | Only matching runs | List |
| F1.5 | cleanupRuns | 5 runs, maxRuns=3 | 2 oldest removed | Cleanup |
| F1.6 | cleanupRuns under limit | 2 runs, maxRuns=5 | 0 removed | Cleanup |
| F1.7 | resolveRunsRoot | `/project` | `/project/.pi/better-subagent/runs` | Paths |

---

## Module: `policy/` (computation/policy)

| ID | Test | Input | Expected | Category |
|----|------|-------|----------|----------|
| Y1.1 | Tool whitelist: allowed | tool="read", policy allowTools=["read"] | allowed=true | Tools |
| Y1.2 | Tool whitelist: denied | tool="write", policy allowTools=["read"] | allowed=false | Tools |
| Y1.3 | Path allow: glob match | path="src/file.ts", allowPaths=["src/**"] | allowed=true | Paths |
| Y1.4 | Path allow: glob no match | path="dist/file.ts", allowPaths=["src/**"] | allowed=false | Paths |
| Y1.5 | Path deny overrides allow | path="src/secret.txt", allow=["src/**"], deny=["src/secret.*"] | allowed=false | Deny |
| Y1.6 | Bash: command allow | command="npm test", bash.allow=["npm *"] | allowed=true | Bash |
| Y1.7 | Bash: command deny | command="rm -rf /", bash.deny=["rm *"] | allowed=false | Bash |
| Y1.8 | Network: domain allowed | domain="example.com", allowedDomains=["example.com"] | allowed=true | Network |
| Y1.9 | Network: domain denied | domain="bad.com", deniedDomains=["bad.com"] | allowed=false | Network |
| Y1.10 | Empty policy | null/empty policy | All actions allowed | Edge |
| Y1.11 | Env: allowed var | env="PATH", allow=["PATH"] | allowed=true | Env |
| Y1.12 | Env: denied var | env="SECRET", deny=["SECRET"] | allowed=false | Env |

---

## Integration Tests

| ID | Test | Input | Expected | Category |
|----|------|-------|----------|----------|
| I1.1 | Full pipeline: registry -> add -> request -> resolve -> compose | Add 2 entries, request via capability, resolve, compose | FinalPrompt with 3 sections (toc, injected, context) | End-to-end |
| I1.2 | Run lifecycle: create -> action -> handoff | Profile, task, 1 action | Handoff with mounted entries, events | End-to-end |
| I1.3 | Continuation roundtrip | create run, continue with new action | Accumulated events from both runs | End-to-end |
| I1.4 | Profile with placeholders | Profile with frontmatter placeholders | `{{name}}` resolved in prompt | Integration |
| I1.5 | Profile with registry entries | Profile with frontmatter registry entries | Entries appear in assembled context | Integration |
| I1.6 | Schedule entries action | action schedule by tag + ids | Entries appear in assembly | Integration |
| I1.7 | Unschedule entries action | schedule then unschedule | Entries removed from assembly | Integration |
| I1.8 | Policy blocks dangerous tool | tool="rm" denied by policy | policy_block event, status=completed | Integration |
| I1.9 | Entry entry point: executeRun create | valid profile + task | RunResult with all fields | Entry |
| I1.10 | Entry point: executeRun continue | create then continue | Continued with new actions | Entry |
| I1.11 | Entry point: re-exports | import from entry/index.ts | Registry, resolve, compose, CapabilityRegistry, types all available | Entry |

---

## Summary

| Module | Test Count |
|--------|-----------|
| core/types.ts | 5 (compile-time) |
| core/registry.ts | 26 |
| core/pipeline.ts | 28 |
| core/composer.ts | 11 |
| core/capability.ts | 15 |
| runtime/registry-store.ts | 12 |
| runtime/run.ts (RunLifecycle) | 14 |
| runtime/actions.ts (MountController) | 14 |
| runtime/output.ts | 7 |
| storage/event-log.ts | 8 |
| storage/run-artifacts.ts | 7 |
| policy/ | 12 |
| Integration | 11 |
| **Total** | **170** |
