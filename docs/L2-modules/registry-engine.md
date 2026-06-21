# L2 Module — `registry-engine`

**Purpose:** The runtime engine of the Prompt Registry, spanning Layer 2 (resolution) and Layer 3 (orchestration). The orchestration layer builds a mutable `ScheduleState` via LLM-callable tool methods; the resolution layer consumes that state through a 5-stage pipeline to produce an ordered, deduplicated list of `ResolvedEntry` objects ready for prompt injection.

---

## Member Files

| L1 Doc | 1-Line Contribution |
|--------|---------------------|
| `registry-resolution.md` | Stateless 5-stage pipeline (`Collect → Dedup → Filter → Sort → Load`) that transforms a `ScheduleState` into `ResolvedEntry[]`; exports `isActive` (lifecycle expiry), `exceedsFrequency` (cap check), and `expandTemplate` (recursive template expansion). |
| `registry-orchestration.md` | Stateful `ScheduleOrchestrator` class: mutable per-round schedule manager exposing schedule/unschedule/query operations designed as LLM tool implementations, plus `resolveForMessage()` which delegates to resolution. |

---

## Internal Relationships (Data Flow & Call Chain)

```
LLM tool calls
     │
     ▼
ScheduleOrchestrator (Layer 3)
  ├── scheduleTags(tags)    ──→ storage.findByTags()   ──→ adds IDs to schedule
  ├── scheduleIds(ids)      ──→ storage.get()          ──→ adds IDs to schedule
  ├── scheduleGroup(group)  ──→ storage.findByGroup()  ──→ adds IDs to schedule
  ├── scheduleTemplate(id)  ──→ stores template ID in templates set
  ├── unscheduleTags/Ids    ──→ removes from schedule
  ├── listScheduled()       ──→ returns schedule summary
  └── getSchedule()         ──→ exports ScheduleState snapshot
           │
           ▼  ScheduleState { tags, ids, groups, templates }
           │
resolveScheduled() (Layer 2)
  ├── 1. COLLECT: expand tags → IDs, collect direct IDs, expand groups → IDs, expand templates → member IDs
  ├── 2. DEDUP: Map<id, RegistryEntry>
  ├── 3. FILTER: isActive(lifecycle, runCtx) && !exceedsFrequency(entry, storage)
  ├── 4. SORT: by priority descending
  └── 5. LOAD: inline content or read filePath from disk
           │
           ▼  ResolvedEntry[]
```

**Coupling rationale:** These two files are merged because `orchestration.ts` directly delegates resolution to `resolution.ts` via `resolveForMessage()` → `resolveScheduled()`. The orchestration layer is the stateful front-door; the resolution layer is the stateless back-end. Together they form a single coherent engine — separating them would create a module boundary across a tight 1:1 call chain.

---

## Dependencies (outside this module)

**Both files import from:**
- `registry-types.md` — `RegistryEntry`, `ScheduleState`, `RunContext`, `ResolvedEntry`
- `registry-storage.md` — index queries (`findByTags`, `findByGroup`, `get`) and frequency queries (`getFrequency`, `getTotalCalls`)

**Additionally imports from:**
- `registry-resolution.md` → `node:fs/promises` (for `loadContent`: reading file-based entry content from disk)

**Imported by:**
- `registry-composer.md` — calls `resolveScheduled()` (from resolution) and uses `ScheduleOrchestrator` (from orchestration) for message composition

## Physical Location

| Source File | Current Path | Notes |
|------------|-------------|-------|
| `registry/resolution.ts` | `registry/resolution.ts` | Stateless 5-stage pipeline (Collect → Dedup → Filter → Sort → Load) |
| `registry/orchestration.ts` | `registry/orchestration.ts` | `ScheduleOrchestrator` class — stateful schedule management, LLM-callable tool methods |

> **Step 4a status: DEFERRED.** Files remain in the legacy `registry/` directory. Planned move to `backend/computation/` not executed.
