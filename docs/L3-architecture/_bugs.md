# L3 Architecture Bugs & Known Issues

## Active Issues

### 1. MountControllerAdapter lazy context race
`MountControllerAdapter` creates the underlying `ControllerImpl` lazily with a placeholder `RunContext`. For session-scoped entries, the context may not resolve correctly until `setRunContext()` is called with the real run ID. New runs generate the run ID inside `RunLifecycle.create()` — the adapter gets the real context after the fact.

**Affected**: `backend/entry/index.ts` MountControllerAdapter
**Severity**: Low (session-scoped entries are uncommon)

### 2. Pipeline silently skips unresolved capabilities
The COLLECT step does not surface unresolved capability names — if `findByCapability("nonexistent")` returns empty, the pipeline continues without diagnosing which capability was unsatisfied. A `warnings` or `unresolved` field on `ContextAssembly` would help.

**Affected**: `backend/core/pipeline.ts` COLLECT step
**Severity**: Low (caller can compare request vs mounted to detect gaps)

## Resolved Issues

| Issue | Resolution |
|---|---|
| Frontend/operation boundary violation | Removed in step 4 refactoring |
| Registry I/O mixed with logic | Split into core/ (algorithm) + runtime/ (I/O) |
| Tool simulator as standalone module | Merged into pipeline + MountController |
| No content-addressed dedup | `generateEntryId()` based on SHA-256 content hash |
| Legacy registry and prompt modules still in codebase | Removed in project compaction — `computation/registry/` and `computation/prompt/` deleted |
