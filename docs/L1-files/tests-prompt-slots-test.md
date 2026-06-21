# `tests/prompt-slots.test.ts`

Tests for the dynamic prompt slot engine (`runtime/prompt-slots/engine.ts`). Covers slot CRUD, placeholder substitution, serialization round-trips, and TTL expiry. All tests reset engine state via `afterEach`.

## Test Suites

### `describe("Prompt slots engine")` — lines 32–113 (10 tests)

Core slot operations: set/clear/list slots, LIFO push/pop, one-shot consumed-on-render, priority ordering in rendered output, event logging, TTL expiry (`expireStaleSlots`), hook-slot cleanup, and `setOnceSlot` with custom TTL.

### `describe("Placeholder system")` — lines 119–284 (13 tests)

File-backed `{{name}}` placeholder substitution with `/tmp` fixtures per test. Covers: register/unregister (exists + missing), single/multiple/repeated placeholder replacement, unregistered → left as-is, post-unregister → literal, missing file graceful degradation, empty file → empty string, placeholder event logging, coexistence with traditional slots (slot prepended before resolved content), and `reset()` clearing both.

### `describe("Slot serialization")` — lines 290–392 (6 tests)

JSON round-trips via `serializeSlots`/`deserializeSlots`: preserves slot content/priority/consumes, stack order, replaces existing state on deserialize, valid JSON output, placeholder inclusion in serialized form, and backward-compatible deserialization of old format (no `placeholders` field).
