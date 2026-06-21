# `config/params.ts` — Tool params validation

## File purpose

Thin validation shim that re-exports the `ToolParams` type and provides a single
runtime-checked parsing function. Keeps the raw Zod import boundary isolated
from consumers that only need to validate incoming tool parameters.

## Exports

| Export | Kind | Lines | Description |
|---|---|---|---|
| `validateToolParams(raw)` | function | 4–6 | Parses an unknown value against `ToolParamsSchema` (Zod). Throws if invalid, returns typed `ToolParams` on success. |
| `ToolParams` | type (re-exported) | (2) | Inferred Zod type: `{ profile: string, task: string, runId?: string, actions?: ActionParams[] }`. |

## Notes

- Delegates to `ToolParamsSchema.parse()` from `./schema.ts` — no custom validation logic.
- Intended as the single entry point for callers in `index.ts` / `runtime/runner.ts` that receive unchecked JSON from the PI agent extension interface.
