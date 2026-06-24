# L1 — `backend/runtime/live-context.test.ts`

**Lines:** ~300

## Purpose

Integration tests for dynamic context loading, frequency enforcement, and session continuity. Exercises the full `executeRun` pipeline with `scheduleEntries`/`unscheduleEntries` actions, verifying prompt composition, durable events, and handoff preservation.

## Test Setup

- **Tmp dir:** `/tmp/efficiency-live-test-<random>` created per test, destroyed in `afterEach`.
- **Test profile:** `live-context` with 4 registry entries (coding-guide, api-reference, testing-guide, security-policy) — two with frequency limits.
- **Helper:** `getUserPrompt(run)` reads `session.jsonl` to extract the composed user message.

## Test Suites

### Dynamic context loading — scheduleEntries
| # | Test | Scenario |
|---|------|----------|
| 1 | injects scheduled entries into the prompt | Schedule `coding` tag, verify `【编码规范】` appears in prompt, `【API参考】` does NOT. Verify `schedule_entries` event logged. |

### Per-run context variation
| # | Test | Scenario |
|---|------|----------|
| 2 | loads different context for different runs with same profile | Run 1 schedules `coding`+`api` → both injected. Run 2 schedules `security` only → different prompt content. Assert `u1 !== u2`. |

### Frequency limit enforcement
| # | Test | Scenario |
|---|------|----------|
| 3 | blocks security-policy on second use (maxTotal=1) | Run 1: security injected. Run 2: security capped — not in prompt but still in ToC. |
| 4 | api-reference works twice but not third time (maxTotal=2) | Three runs, third one capped. |

### Unschedule
| # | Test | Scenario |
|---|------|----------|
| 5 | removes entries via unscheduleEntries in same invocation | Schedule `coding`+`api`, then unschedule `api`. Only `coding` injected. |

### Continuation run
| # | Test | Scenario |
|---|------|----------|
| 6 | preserves handoff across continuation with different context per run | Run 1 schedules `coding`. Run 2 continues with same runId, schedules `api` instead. `run_continue` event logged. Second run has `【API参考】` not `【编码规范】`. |

### No-schedule baseline
| # | Test | Scenario |
|---|------|----------|
| 7 | shows ToC but injects nothing when no scheduleEntries action | No schedule actions → ToC lists entries but no `【...】` content injected. |
