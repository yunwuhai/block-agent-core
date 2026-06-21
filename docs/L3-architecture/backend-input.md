# L3 Architecture: Backend — 输入 (Input)

Layer for modules that parse, load, and validate incoming data from external sources — configuration files, user parameters, and profile definitions.

> **Quadrant definition:** Modules that parse/load/validate incoming data (config loading, profile parsing, policy loading).

## Member Modules

| # | Module | Primary | Description | L2 Doc |
|---|--------|---------|-------------|--------|
| 1 | `configuration` | 输入 | Core configuration type system: Zod schemas for tool parameters, profiles, hooks, registry entries, project policy. Runtime validation via `validateToolParams()`. Foundation of the config layer. | [configuration.md](../L2-modules/configuration.md) |
| 2 | `profile-management` | 输入 | Load, parse, and validate subagent profile definitions from YAML frontmatter in `.profiles/*.md` files. Purpose-built recursive-descent YAML parser. | [profile-management.md](../L2-modules/profile-management.md) |
| 3 | `project-policy` | 输入 | Load and validate project-level security/policy JSON from `.pi/efficiency-subagent/config.json`. Graceful degradation: missing/invalid → null (allow all). | [project-policy.md](../L2-modules/project-policy.md) |

---

## Module Detail: `configuration`

**Purpose:** Core configuration type system — defines all Zod schemas and provides runtime validation for incoming tool invocation parameters. This is the foundation of the entire config layer; all other config modules depend on it.

### Member L1 Files

| L1 Doc | Summary |
|--------|---------|
| `config-schema.md` | Zod schema definitions: `ToolParamsSchema`, `ProfileFrontmatterSchema`, `HooksConfigSchema`, `RegistryEntrySchema`, `ProjectPolicySchema`, and their inferred types. Shape-only — no runtime logic. |
| `config-params.md` | Thin validation shim: `validateToolParams(raw)` — parses unknown input against `ToolParamsSchema`, throws on failure, returns typed `ToolParams`. Re-exports `ToolParams` type. |

### Key Exports

- **Schemas:** `ToolParamsSchema`, `ProfileFrontmatterSchema`, `HooksConfigSchema`, `RegistryEntrySchema`, `ProjectPolicySchema`
- **Types:** `ToolParams`, `ProfileFrontmatter`, `HooksConfig`, `RegistryEntryConfig`, `ProjectPolicy`
- **Validator:** `validateToolParams(raw: unknown): ToolParams`

### Why This Classification

`configuration` is the definitive **输入 module**. It takes unknown/untrusted data crossing the system boundary (user-provided tool parameters) and transforms it into typed, validated data via Zod parsing. It performs no computation beyond validation, no storage, and no display. It is the parse-don't-validate gate at the system's input boundary.

---

## Module Detail: `profile-management`

**Purpose:** Load, parse, and validate subagent profile definitions from YAML frontmatter in `.profiles/*.md` files — the primary mechanism for configuring subagent behavior (tools, hooks, placeholders, registry entries, prompt body).

### Member L1 Files

| L1 Doc | Summary |
|--------|---------|
| `config-profile-loader.md` | Recursive-descent YAML parser + three public functions: `listProfiles()`, `loadProfile()`, `resolveProfileDir()`. Single-file, self-contained. |

### Key Exports

- `listProfiles()` — Scan all `.profiles/*.md` files
- `loadProfile(name: string)` — Load one profile by name with Zod validation
- `resolveProfileDir()` — Resolve `.profiles/` path

### Why This Classification

`profile-management` is a pure **输入 module**. It reads files from disk (data ingestion), parses YAML frontmatter (parsing), validates against Zod schemas (validation), and returns typed `ProfileDefinition` objects. The custom YAML parser is purpose-built for profile frontmatter — no external YAML dependency. It has no computation beyond parsing, no output artifact generation, and no storage ownership.

---

## Module Detail: `project-policy`

**Purpose:** Load and validate the project-level security/policy configuration from `.pi/efficiency-subagent/config.json`. Defines tool allow/deny lists, path restrictions, bash command controls, network domain rules, and environment variable access for the subagent sandbox.

### Member L1 Files

| L1 Doc | Summary |
|--------|---------|
| `config-project-loader.md` | Single async function `loadProjectPolicy(cwd)` — reads JSON, validates against `ProjectPolicySchema`, returns `ProjectPolicy` or `null`. |

### Key Exports

- `loadProjectPolicy(cwd: string): Promise<ProjectPolicy | null>`

### Why This Classification

`project-policy` is a pure **输入 module**. It reads a JSON configuration file from disk, parses it, validates it against the `ProjectPolicySchema`, and returns the result. The graceful degradation (null on missing/invalid) makes it a well-behaved input gate: the system continues to function without the config. No computation, no storage, no output — just data ingestion.

---

## Layer Position in Architecture

```
┌──────────────────────────────────────────────────┐
│                  FRONTEND                         │
│  ┌────────────────┐  ┌────────────────────────┐  │
│  │   显示 (Display) │  │  操作 (Operation)       │  │
│  └────────────────┘  └──────────┬─────────────┘  │
├─────────────────────────────────┼────────────────┤
│                  BACKEND        │                 │
│  ┌──────────────────┐           │                 │
│  │  输入 (Input)      │◄─────────┘                 │
│  │  configuration    │                            │
│  │  profile-mgmt     │                            │
│  │  project-policy   │                            │
│  └──────────────────┘                            │
│  ┌───────┐ ┌─────────┐ ┌──────────────────────┐  │
│  │ 输出   │ │ 存储     │ │ 计算                  │  │
│  └───────┘ └─────────┘ └──────────────────────┘  │
└──────────────────────────────────────────────────┘
```

The 输入 layer is the **data ingestion surface** — it reads configuration from disk, parses user parameters, validates schemas, and feeds typed data into the computation and storage layers. All three modules are pure input: they read, parse, validate, and return. None perform computation beyond validation or own persistent state.
