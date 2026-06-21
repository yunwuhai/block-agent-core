# L1 — `backend/computation/prompt/prompt-slots.test.ts`

**Purpose:** Tests the dynamic prompt engine: slot CRUD, placeholder substitution, TTL expiry, event log, and serialization round trips.

## Suites

| Suite | Lines | Description |
|---|---|---|
| `Prompt slots engine` | 31–103 | Tests set/clear/list slots, LIFO push/pop, one-shot consumption, priority rendering, event logging, TTL expiry, and `setOnceSlot` TTL. |
| `Placeholder system` | 109–274 | Tests file-backed `{{name}}` placeholder registration, rendering, unregister behavior, missing/empty files, event log, coexistence with slots, and reset cleanup. |
| `Slot serialization` | 280–382 | Tests `serializeSlots()`/`deserializeSlots()` for slots, stacks, JSON validity, placeholders, and old-format compatibility. |
