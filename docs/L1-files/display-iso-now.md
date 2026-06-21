# `display/iso-now.ts` — ISO Timestamp Utility

**Purpose:** Single-source-of-truth timestamp formatter that deduplicates the `new Date().toISOString()` pattern across the `display/` and `runtime/` modules (proposal `tui-002`). Centralizes the one-line call so every module gets consistent ISO 8601 timestamps from the same import.

## Exports

| Export | Kind | Lines | Description |
|--------|------|-------|-------------|
| `isoNow()` | function | 5–7 | Returns `new Date().toISOString()` — the current UTC instant as a standard ISO 8601 string (e.g. `"2026-06-21T12:34:56.789Z"`). Zero-config, zero-dependency. |
