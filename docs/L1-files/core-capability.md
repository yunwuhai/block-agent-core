# L1 -- `backend/core/capability.ts`

**Purpose:** CapabilityRegistry — manages capability definitions and their implication DAG. Supports declare/get/remove, recursive implies expansion with cycle detection, and default entry ID lookup. Used by the pipeline COLLECT step to resolve capability names into entry lookups. Pure data structure.

**Lines:** 330

## Exports

| Export | Kind | Lines | Description |
|---|---|---|---|
| `InvalidCapabilityNameError` | class | 51--60 | Thrown when capability name doesn't match `/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/` |
| `MissingImpliedCapabilityError` | class | 66--74 | Thrown when `declare()` references implied capabilities that haven't been declared |
| `CircularImpliesError` | class | 79--90 | Thrown when `expand()` detects a cycle. Contains `path: string[]` showing the cycle. |

### `CapabilityRegistry` class

| Method | Lines | Description |
|---|---|---|
| `constructor()` | 116--119 | Initializes empty capability map |
| `declare(capability)` | 142--169 | Register a capability. Validates name format + implied existence. Overwrites existing. Shallow-copies arrays to defend against external mutation. |
| `get(name)` | 182--184 | Retrieve by name. Returns `Capability \| undefined`. |
| `has(name)` | 192--194 | Check existence. Returns `boolean`. |
| `list()` | 204--211 | List all capabilities (shallow copies for immutability). Returns `Capability[]`. |
| `remove(name)` | 230--232 | Remove a capability. Does NOT check if other capabilities imply the removed one. Returns `boolean`. |
| `expand(names)` | 268--307 | Recursively expand capability names through `implies` DAG. Returns all transitively satisfied capability names in topological order. Throws `CircularImpliesError` on cycle. |
| `getDefaultEntries(name)` | 323--328 | Return `defaultEntryIds` for a capability. Returns `string[]`. |

## Internal

| Symbol | Lines | Description |
|---|---|---|
| `NAME_RE` | 41 | `/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/` — validates capability name format |
| `caps` | 110 | `Map<string, Capability>` — internal storage |

## Implies Expansion Algorithm

```
expand(["A"]) where A implies [B, C], B implies [D], C implies [D]
  → visit("A", [])
    → result: ["A"]
    → visit("B", ["A"])
      → result: ["A", "B"]
      → visit("D", ["A", "B"])
        → result: ["A", "B", "D"]
    → visit("C", ["A"])
      → "D" already seen → skip
      → result: ["A", "B", "D", "C"]
  → return ["A", "B", "D", "C"]
```

Cycle detection via `visiting` set: if `visiting.has(name)` at entry, a `CircularImpliesError` is thrown with the full cycle path. Already-visited nodes (`seen` set) are skipped without error.

## Notes

- **Separation of concerns**: `CapabilityRegistry` manages capability *definitions*; `Registry` manages entry *storage*. The pipeline uses both.
- **Forward references not allowed**: All `implies` targets must already be declared. Declare dependencies before dependents.
- **Remove is not cascading**: Removing a capability does not check or update other capabilities that imply it. Callers must audit after removal.
- **Shallow copy on write**: `declare()` and `list()` produce shallow copies to prevent external mutation of internal state.
