# Redundancy Audit — efficiency-subagent

**Date:** 2026-06-21  
**Scope:** All 34 L1 source-file docs, 4 L2 module docs, and 4 key source files (`index.ts`, `runtime/runner.ts`, `runtime/orchestrator.ts`, `runtime/tool-simulator.ts`)  
**Purpose:** Identify redundant features, functions, types, and documentation staleness for the Step 6 deletion discussion

---

## 1. Must Delete (clear waste, no consumers)

### R1 — `runtime/runner.ts`: 8-line thin wrapper (HIGH)

| Field | Detail |
|-------|--------|
| **What** | `runtime/runner.ts` (8 lines) is a pure passthrough that imports `executeRun` from `orchestrator.ts` and re-exports it unchanged. Forms a triple re-export chain: `orchestrator.ts` → `runner.ts` → `mod.ts` → `index.ts`. |
| **Where** | `runtime/runner.ts` (file: 8 lines total); `runtime/mod.ts` (lines 1–2: re-exports from `runner.ts`) |
| **Impact** | Adds 2 unnecessary file reads and import resolution hops on every cold start. Confuses LLMs reading the codebase — the file named "runner" has no logic while "orchestrator" has it all. The L1 doc `runtime-runner.md` describes orchestrator.ts code as if it were in runner.ts, creating doc/source mismatch. |
| **Recommendation** | **DELETE** `runtime/runner.ts`. Update `runtime/mod.ts` to import directly from `./orchestrator.ts`. Net deletion: 1 file, simplified import graph. |

### R2 — `hooks/scripts/_example.ts`: Template/demo hook with no function (HIGH)

| Field | Detail |
|-------|--------|
| **What** | A hook script that always returns `{ allowed: true, reason: "example always passes" }`. Marked as "template/reference" in L1 doc. Lives alongside real hooks in `hooks/scripts/` where dynamic `import()` can invoke it. |
| **Where** | `hooks/scripts/_example.ts` (lines 15–27); L1 doc: `hooks-scripts-_example.md` |
| **Impact** | If a profile references `"_example"` in its hook config, the hook runner will load and execute this no-op. Pollutes the hook namespace. Exists purely as documentation that should live in `docs/` or `README.md`, not in the runtime hook directory. |
| **Recommendation** | **DELETE** `hooks/scripts/_example.ts` and its L1 doc. Move the hook-contract documentation to a `docs/hooks-authoring.md` guide or inline in `runtime/hooks/types.ts` JSDoc. |

### R3 — Dead imports in `index.ts`: `renderCompact` and `listRunIds` (HIGH)

| Field | Detail |
|-------|--------|
| **What** | `index.ts` line 23 imports `renderCompact`; line 24 imports `listRunIds`. Neither is used anywhere in the 145-line file. `renderCompact` is called internally by `renderSectioned` in `display/events.ts` (not from index.ts). `listRunIds` is only used in tests. |
| **Where** | `index.ts` lines 23–24 |
| **Impact** | Every LLM reading `index.ts` sees 2 unused imports. These waste context tokens and signal code-rot. Reduces import clarity — a reader must verify each import is used. |
| **Recommendation** | **DELETE** `renderCompact` and `listRunIds` from the index.ts import block. Only `renderSectioned` is needed from display; `listRunIds` is never called. |

### R4 — Unused public API exports: `listProfiles` and `resolveProfileDir` (MEDIUM)

| Field | Detail |
|-------|--------|
| **What** | `listProfiles()` and `resolveProfileDir()` are exported from `config/profile-loader.ts` and re-exported through `config/mod.ts`. Verified: **zero consumers** outside profile-loader.ts itself. `listProfiles` has no test coverage either. |
| **Where** | `config/profile-loader.ts` lines 413, 422; `config/mod.ts` line 16; L1 docs: `config-profile-loader.md` lines 9–13 |
| **Impact** | Unused exports bloat the config barrel, add unnecessary L1 documentation, and create maintenance burden (must keep Zod schemas in sync). If they were intended as future public API, they should be marked `@internal` or removed until needed. |
| **Recommendation** | **DELETE** `listProfiles` and `resolveProfileDir` from export surface. Make `resolveProfileDir` file-private (only `loadProfile` calls it). Remove `listProfiles` entirely (dead code). Remove from `config/mod.ts` barrel and update `config-profile-loader.md`. |

---

## 2. Consider Merging (duplication with slightly different purposes)

### R5 — Near-duplicate hook scripts: `before-mkdir` and `after-mkdir` (MEDIUM)

| Field | Detail |
|-------|--------|
| **What** | Both execute `ls -la` on `ctx.cwd` with a 5-second timeout via `spawnSync`, both return `allowed: true`, both inject a user-role `sessionMessage` with the listing. Only difference: reason string (`"before-mkdir 检查通过"` vs `"after-mkdir 检查通过"`) and the session message label. |
| **Where** | `hooks/scripts/before-mkdir.ts` (lines 6–29); `hooks/scripts/after-mkdir.ts` (lines 6–30); L1 docs: `hooks-scripts-before-mkdir.md`, `hooks-scripts-after-mkdir.md` |
| **Impact** | ~85% code duplication. Two separate files, two L1 docs. Any change to the `ls -la` logic (timeout, error handling, output format) must be applied in both places. |
| **Recommendation** | **MERGE** into a single `ls-directory.ts` hook parameterized by phase. Or, since the pre/post distinction is semantically meaningful (before shows state before mkdir, after shows the result), **KEEP** but extract shared `runLsWithTimeout()` helper into `hooks/scripts/_utils.ts` to avoid duplication. |

### R6 — Overlapping hook scripts: `announce-phase` and `registry-output` (LOW)

| Field | Detail |
|-------|--------|
| **What** | Both inject `slotContent` AND `sessionMessage` into the agent context. `announce-phase` injects a phase label with metadata; `registry-output` injects `ls -la` + registry entry count. Both return `{ allowed: true, slotContent, sessionMessage }` with the same pattern. |
| **Where** | `hooks/scripts/announce-phase.ts` (lines 9–30); `hooks/scripts/registry-output.ts` (lines 8–54); L1 docs: `hooks-scripts-announce-phase.md`, `hooks-scripts-registry-output.md` |
| **Impact** | Both exercise the `slotContent` + `sessionMessage` dual-injection pattern. Their purposes differ (announcement vs filesystem snapshot) so duplication is limited to the return shape. Low overhead. |
| **Recommendation** | **KEEP** separate — purposes are distinct (context announcement vs state snapshot). Minor pattern overlap is acceptable. |

### R7 — `runtime-runner.md` L1 doc is stale and misaligned with actual source (HIGH)

| Field | Detail |
|-------|--------|
| **What** | The L1 doc describes `runtime/runner.ts` as "~965 lines" containing `executeRun()`, `runPhaseHook()`, `executeWithRetry()`, `simulateToolInteraction()`, and handoff helpers (`extractFilesTouched`, etc.). Reality: `runner.ts` is 8 lines of passthrough. The actual implementations live in `runtime/orchestrator.ts` (600 lines, lifecycle orchestration) and `runtime/tool-simulator.ts` (287 lines, tool execution + retry + hook dispatching). |
| **Where** | `docs/L1-files/runtime-runner.md` (entire doc); actual source: `runtime/runner.ts` (8 lines), `runtime/orchestrator.ts` (600 lines), `runtime/tool-simulator.ts` (287 lines) |
| **Impact** | **Severe LLM confusion.** The L1 doc claims `runPhaseHook` and `simulateToolInteraction` are "internal to runner.ts" but they are separate exported functions in `tool-simulator.ts`. The L2 doc `runtime-core.md` repeats the same stale claim ("Primary orchestrator (~965 lines)"). Any LLM reading the docs will look for code in the wrong file. |
| **Recommendation** | **REWRITE** `runtime-runner.md` to accurately reflect the split architecture: `runner.ts` is a thin re-export, `orchestrator.ts` handles lifecycle, `tool-simulator.ts` handles per-action execution. OR — if R1 is accepted — delete `runtime-runner.md` entirely and rename documents to `runtime-orchestrator.md` and `runtime-tool-simulator.md`. |

### R8 — `generateRunArtifacts` and handoff helpers lack L1 documentation (MEDIUM)

| Field | Detail |
|-------|--------|
| **What** | `storage/run-artifacts.ts` exports `generateRunArtifacts`, `extractFilesTouched`, `mapToolToOperation`, `extractFilePath`, `extractToolSummary`, `extractBlockContext`. It is imported by `orchestrator.ts` (line 27, 493) and re-exported from `storage/mod.ts` (line 7). But NO L1 doc exists for this file. The `storage-mod.md` L1 doc only lists exports from 3 files, omitting the 4th (`run-artifacts.ts`). |
| **Where** | Source: `storage/run-artifacts.ts`; missing L1 doc: `docs/L1-files/storage-run-artifacts.md` (does not exist) |
| **Impact** | Incomplete documentation means LLMs cannot fully understand the handoff generation pipeline. Functions exist but are invisible to doc-based exploration. |
| **Recommendation** | **CREATE** `docs/L1-files/storage-run-artifacts.md` documenting all exports. Update `storage-mod.md` to list the 4th source file. |

---

## 3. Keep But Note (appears redundant but serves distinct purpose)

### R9 — Barrel files: `display/mod.ts`, `runtime/hooks/mod.ts`, `policy/mod.ts` (LOW)

| Field | Detail |
|-------|--------|
| **What** | Several barrel files re-export from only 2–3 submodules each. `display/mod.ts` → 2 files (`events.ts`, `iso-now.ts`). `runtime/hooks/mod.ts` → 3 files (`runner.ts`, `slot-insertion.ts`, `types.ts`), 4 lines. `policy/mod.ts` → 2 files (`merge.ts`, `evaluator.ts`). |
| **Where** | `display/mod.ts`, `runtime/hooks/mod.ts`, `policy/mod.ts` |
| **Impact** | Each barrel costs ~15–30 lines of source + ~28 lines of L1 doc. However, they provide architectural consistency — every subsystem has a single import point. Overhead is modest. |
| **Recommendation** | **KEEP.** The architectural pattern (single import per layer) is consistent across the codebase and valued. Token cost is minimal. |

### R10 — `display/iso-now.ts`: 3-line utility in its own file (LOW)

| Field | Detail |
|-------|--------|
| **What** | A 9-line file (3 lines of code) wrapping `new Date().toISOString()`. Created per proposal `tui-002` to deduplicate the pattern. Used by `orchestrator.ts` (line 14) and `tool-simulator.ts` (line 11). |
| **Where** | `display/iso-now.ts`; L1 doc: `display-iso-now.md` |
| **Impact** | The file + its L1 doc cost more tokens than the 3-line code it replaces. But the deduplication intent is valid (2 consumers). |
| **Recommendation** | **KEEP.** Deduplication across 2 files justifies the overhead. If the function were only used once, inlining would be preferred. |

### R11 — `runtime/mod.ts` barrel chaining through `runner.ts` (LOW — moot if R1 accepted)

| Field | Detail |
|-------|--------|
| **What** | `runtime/mod.ts` re-exports from `runner.ts`, which re-exports from `orchestrator.ts`. This is a barrel → thin wrapper → real implementation chain. |
| **Where** | `runtime/mod.ts` (4 lines); `runtime/runner.ts` (8 lines) |
| **Impact** | If R1 is accepted (delete `runner.ts`), this becomes a clean barrel → implementation import. If R1 is rejected, this is a wasteful double-hop. |
| **Recommendation** | **CONDITIONAL on R1:** If `runner.ts` is deleted, keep `mod.ts` importing directly from `orchestrator.ts`. Otherwise, collapse the chain. |

### R12 — `renderCompact` imported in `index.ts` but only used internally by `renderSectioned` (LOW)

| Field | Detail |
|-------|--------|
| **What** | `renderCompact` is called inside `renderSectioned()` at `display/events.ts` line 215, so it is NOT dead code. But the import at `index.ts` line 23 is unnecessary — `index.ts` only calls `renderSectioned`. |
| **Where** | `index.ts` line 23; `display/events.ts` line 162 (definition), line 215 (internal call) |
| **Impact** | The dead import on index.ts wastes tokens. The function itself is correctly used internally by the display module. |
| **Recommendation** | Aligned with R3: **DELETE** from `index.ts` import. The function stays, the import goes. |

---

## 4. Summary Table

| # | Severity | Category | What | Files | Recommendation |
|---|----------|----------|------|-------|----------------|
| R1 | **HIGH** | Over-engineered abstraction | 8-line passthrough `runner.ts` wrapping orchestrator | `runtime/runner.ts`, `runtime/mod.ts` | DELETE `runner.ts`; update `mod.ts` |
| R2 | **HIGH** | Dead code | Template/demo hook in runtime dir | `hooks/scripts/_example.ts`, L1 doc | DELETE file + doc |
| R3 | **HIGH** | Unused exports | `renderCompact` + `listRunIds` dead imports | `index.ts` L23–24 | DELETE from import block |
| R4 | **MEDIUM** | Unused exports | `listProfiles`, `resolveProfileDir` — zero consumers | `config/profile-loader.ts`, `config/mod.ts` | DELETE or mark `@internal` |
| R5 | **MEDIUM** | Duplicate functions | `before-mkdir` / `after-mkdir` ~85% code overlap | `hooks/scripts/before-mkdir.ts`, `hooks/scripts/after-mkdir.ts` | MERGE or extract shared helper |
| R6 | **LOW** | Feature overlap | `announce-phase` + `registry-output` pattern similarity | `hooks/scripts/announce-phase.ts`, `hooks/scripts/registry-output.ts` | KEEP separate (distinct purposes) |
| R7 | **HIGH** | Dead code (doc staleness) | `runtime-runner.md` describes 965-line file that doesn't exist | `docs/L1-files/runtime-runner.md`, `docs/L2-modules/runtime-core.md` | REWRITE to reflect orchestrator/tool-simulator split |
| R8 | **MEDIUM** | Missing documentation | `storage/run-artifacts.ts` has no L1 doc | `storage/run-artifacts.ts`, `docs/L1-files/storage-mod.md` | CREATE `storage-run-artifacts.md` |
| R9 | **LOW** | Over-engineered abstraction | Barrel files re-exporting 2–3 submodules | `display/mod.ts`, `runtime/hooks/mod.ts`, `policy/mod.ts` | KEEP (architectural consistency) |
| R10 | **LOW** | Over-engineered abstraction | 3-line `isoNow()` in dedicated file | `display/iso-now.ts` | KEEP (2 consumers justify dedup) |
| R11 | **LOW** | Over-engineered abstraction | Barrel → wrapper → implementation chain | `runtime/mod.ts` → `runtime/runner.ts` → `runtime/orchestrator.ts` | SOLVED by R1 |
| R12 | **LOW** | Unused exports | `renderCompact` dead import in entry point | `index.ts` L23 | SOLVED by R3 |

---

## 5. Token Impact Estimate

| Action | Files Deleted | Lines Removed | Docs Reduced | Est. Token Savings (per LLM context read) |
|--------|---------------|---------------|--------------|--------------------------------------------|
| R1: Delete `runner.ts` | 1 | 8 | 1 doc becomes stale | ~200 (file + import chain resolution) |
| R2: Delete `_example.ts` | 1 + 1 doc | 12 | 17 lines doc | ~300 |
| R3: Dead imports | 0 (edit) | 2 lines | — | ~20 (small but in the most-read file) |
| R4: Unused config exports | 0 (edit) | ~5 lines | 2 doc entries | ~100 |
| R7: Rewrite stale doc | 0 | 0 (rewrite) | ~74 lines stale | ~800 (LLM confusion cost) |
| **Total (MUST DELETE)** | **2 files** | **~27 lines** | **~90 lines docs** | **~1,400 tokens** |

---

## 6. Dependencies Between Recommendations

```
R3 (dead imports) ← independent
R1 (delete runner.ts) → enables R11 (barrel chain resolved)
R7 (rewrite runner.md docs) → depends on R1 outcome
R8 (create run-artifacts.md) ← independent
R4 (unused config exports) ← independent
R2 (delete _example) ← independent
R5 (merge mkdir hooks) ← independent
```

**Recommended execution order:** R3 → R1 → R7 → R2 → R4 → R8 → R5 (highest-impact first, independent items can be parallelized).

---

*Audit completed 2026-06-21. All findings based on cross-referencing 34 L1 docs, 4 L2 docs, and 4 source files against actual source code via grep verification.*
