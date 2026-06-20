import { isoNow } from "./iso-now.ts";

export interface DisplayEvent {
  readonly type: "run_start" | "run_end" | "tool_call" | "tool_result" | "hook" | "policy" | "slot" | "handoff";
  readonly timestamp: string;
  readonly label: string;
  readonly detail: string;
  readonly status: "ok" | "error" | "blocked" | "running";
  readonly expandable?: {
    readonly title: string;
    readonly body: string;
  };
}

// ---------------------------------------------------------------------------
// Configurable truncation (proposal tui-005)
// ---------------------------------------------------------------------------

export const DEFAULT_TRUNCATION = 80;

// Strip ANSI escape sequences from user-provided strings to prevent terminal injection
function sanitize(raw: string): string {
  return raw.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

// ---------------------------------------------------------------------------
// Factory (proposal tui-001)
// ---------------------------------------------------------------------------

export function createEvent(config: {
  type: DisplayEvent["type"];
  label: string;
  detail: string;
  status: DisplayEvent["status"];
  expandable?: DisplayEvent["expandable"];
}): DisplayEvent {
  return {
    type: config.type,
    timestamp: isoNow(),
    label: sanitize(config.label),
    detail: sanitize(config.detail),
    status: config.status,
    expandable: config.expandable
      ? {
          title: sanitize(config.expandable.title),
          body: config.expandable.body,
        }
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Thin wrappers — preserved for backward compatibility with all existing callers
// ---------------------------------------------------------------------------

export function formatRunStart(profile: string, task: string): DisplayEvent {
  return createEvent({
    type: "run_start",
    label: `Starting ${profile}`,
    detail: task,
    status: "running",
  });
}

export function formatRunEnd(success: boolean): DisplayEvent {
  return createEvent({
    type: "run_end",
    label: `Run ${success ? "completed" : "failed"}`,
    detail: success ? "All steps completed." : "Run failed.",
    status: success ? "ok" : "error",
  });
}

export function formatToolCall(name: string, args?: Record<string, unknown>): DisplayEvent {
  const serialized = args ? JSON.stringify(args, null, 2) : "";
  return createEvent({
    type: "tool_call",
    label: `Tool: ${name}`,
    detail: serialized.slice(0, DEFAULT_TRUNCATION),
    status: "running",
    expandable:
      serialized.length > DEFAULT_TRUNCATION
        ? { title: "Arguments", body: serialized }
        : undefined,
  });
}

export function formatToolResult(name: string, output: string, isError: boolean): DisplayEvent {
  return createEvent({
    type: "tool_result",
    label: `Result: ${name}` + (isError ? " (error)" : ""),
    detail: output.slice(0, DEFAULT_TRUNCATION),
    status: isError ? "error" : "ok",
    expandable:
      output.length > DEFAULT_TRUNCATION
        ? { title: "Full Output", body: output }
        : undefined,
  });
}

export function formatHook(phase: string, script: string, ok: boolean): DisplayEvent {
  return createEvent({
    type: "hook",
    label: `Hook [${phase}]: ${script}`,
    detail: ok ? "OK" : "failed",
    status: ok ? "ok" : "error",
  });
}

export function formatPolicyBlock(reason: string): DisplayEvent {
  return createEvent({
    type: "policy",
    label: "Blocked by policy",
    detail: reason,
    status: "blocked",
  });
}

export function formatHookBlock(reason: string): DisplayEvent {
  return createEvent({
    type: "policy",
    label: "Blocked by hook",
    detail: reason,
    status: "blocked",
  });
}

// Available for integration — currently exercised by tests, not yet wired
// into the runner. (proposal tui-003)
export function formatSlotChange(slotName: string, operation: string): DisplayEvent {
  return createEvent({
    type: "slot",
    label: `Slot: ${operation} ${slotName}`,
    detail: "",
    status: "ok",
  });
}

// Available for integration — currently exercised by tests, not yet wired
// into the runner. (proposal tui-003)
export function formatHandoff(path: string): DisplayEvent {
  return createEvent({
    type: "handoff",
    label: "Handoff saved",
    detail: path,
    status: "ok",
  });
}

const COLORS = {
  ok: "\x1b[32m",      // green
  error: "\x1b[31m",   // red
  blocked: "\x1b[33m", // yellow
  running: "\x1b[36m", // cyan
  reset: "\x1b[0m",
} as const;

// ---------------------------------------------------------------------------
// Compact rendering (original flat format — backward compatible)
// ---------------------------------------------------------------------------

export function renderCompact(event: DisplayEvent, index: number, useColor = true): string {
  const icon =
    event.status === "ok" ? " ✅"
    : event.status === "error" ? " ❌"
    : event.status === "blocked" ? " 🚫"
    : " ⏳";
  const suffix = event.detail ? ` — ${event.detail}` : "";
  const line = `${index + 1}.${icon} ${event.label}${suffix}`;
  if (useColor && COLORS[event.status]) {
    return `${COLORS[event.status]}${line}${COLORS.reset}`;
  }
  return line;
}

// ---------------------------------------------------------------------------
// Structured sectioned rendering (proposal tui-004)
// ---------------------------------------------------------------------------

type PhaseGroup = {
  header: string;
  events: DisplayEvent[];
};

const PHASE_MAP: Readonly<Record<DisplayEvent["type"], string>> = {
  run_start: "Run",
  run_end: "Run",
  tool_call: "Tool Calls",
  tool_result: "Tool Results",
  hook: "Hooks",
  policy: "Policy",
  slot: "Slot Changes",
  handoff: "Handoff",
};

export function renderSectioned(events: readonly DisplayEvent[], useColor = true): string {
  const groups: PhaseGroup[] = [];

  for (const event of events) {
    const header = PHASE_MAP[event.type] ?? "Other";
    const group = groups.find((g) => g.header === header);
    if (group) {
      group.events.push(event);
    } else {
      groups.push({ header, events: [event] });
    }
  }

  const lines: string[] = [];
  let globalIndex = 0;

  for (const group of groups) {
    lines.push(`── ${group.header} ──`);
    for (const event of group.events) {
      lines.push(renderCompact(event, globalIndex, useColor));
      globalIndex++;
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}
