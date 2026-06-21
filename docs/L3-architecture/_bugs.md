# L3 Architecture: Boundary Notes

## `runtime-core`

`runtime-core` remains the intentional cross-layer coordinator. Its primary role is operation: receiving validated parameters, sequencing the run lifecycle, and dispatching explicit actions. It also calls backend input, computation, storage, and output modules.

Current split:

| File | Layer | Role |
|---|---|---|
| `frontend/operation/orchestrator.ts` | Frontend 操作 | Run lifecycle sequencing and artifact orchestration |
| `frontend/operation/tool-simulator.ts` | Frontend 操作 | Policy-checked action simulation and retry handling |
| `frontend/operation/mod.ts` | Frontend 操作 | Public barrel |

## Current Risk

The orchestrator still performs direct wiring across many backend modules. This is acceptable for the current small extension surface, but future growth should move repeated storage/output routines behind narrower backend service functions.
