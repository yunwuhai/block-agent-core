# L2 Module: Configuration Schema & Validation

**Purpose:** Core configuration type system for efficiency-subagent — defines all Zod schemas (tool params, profiles, hooks, registry entries, project policy) and provides runtime validation for incoming tool invocation parameters.

## Member Files

| L1 Doc | Summary |
|--------|---------|
| `config-schema.md` | Zod schema definitions for the entire configuration layer — `ToolParamsSchema`, `ProfileFrontmatterSchema`, `HooksConfigSchema`, `RegistryEntrySchema`, `ProjectPolicySchema`, and their inferred types. No runtime logic; shape-only. |
| `config-params.md` | Thin validation shim exposing `validateToolParams(raw)` — parses unknown input against `ToolParamsSchema`, throws on failure, returns typed `ToolParams` on success. Re-exports the `ToolParams` type. |

## Intra-Module Relationships

- `config-params.md` directly imports and wraps `ToolParamsSchema` from `config-schema.md` — it exists solely to give callers a single `validateToolParams()` entry point without importing Zod directly.
- Together they form the **configuration type system**: schema defines the contract, params enforces it at runtime.

## External Dependencies

- **None.** This module is the foundation of the config layer — all other config modules depend on it.

## Physical Location

| Source File | Current Path | Notes |
|------------|-------------|-------|
| `config/schema.ts` | `backend/input/schema.ts` | Zod schema definitions for the entire configuration layer |
| `config/params.ts` | `backend/input/params.ts` | `validateToolParams()` runtime validation shim |

> **Step 4 reorganization status: COMPLETE.** Configuration schema and validation files now live in the Backend 输入 layer under `backend/input/`.

## Notes

- The `backend/input/mod.ts` barrel (`config-mod.md`) re-exports everything from this module (all schemas, types, and `validateToolParams`) alongside exports from Profile Management and Project Policy.
- No non-exported items in either file — every symbol is part of the public config API.
