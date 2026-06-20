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

export function formatRunStart(profile: string, task: string): DisplayEvent {
  return {
    type: "run_start",
    timestamp: isoNow(),
    label: `Starting ${profile}`,
    detail: task,
    status: "running",
  };
}

export function formatRunEnd(success: boolean): DisplayEvent {
  return {
    type: "run_end",
    timestamp: isoNow(),
    label: `Run ${success ? "completed" : "failed"}`,
    detail: success ? "All steps completed." : "Run failed.",
    status: success ? "ok" : "error",
  };
}

export function formatToolCall(name: string, args?: Record<string, unknown>): DisplayEvent {
  return {
    type: "tool_call",
    timestamp: isoNow(),
    label: `Tool: ${name}`,
    detail: args ? JSON.stringify(args, null, 2).slice(0, 200) : "",
    status: "running",
    expandable: args ? { title: "Arguments", body: JSON.stringify(args, null, 2) } : undefined,
  };
}

export function formatToolResult(name: string, output: string, isError: boolean): DisplayEvent {
  return {
    type: "tool_result",
    timestamp: isoNow(),
    label: `Result: ${name}` + (isError ? " (error)" : ""),
    detail: output.slice(0, 200),
    status: isError ? "error" : "ok",
    expandable: output.length > 200 ? { title: "Full Output", body: output } : undefined,
  };
}

export function formatHook(phase: string, script: string, ok: boolean): DisplayEvent {
  return {
    type: "hook",
    timestamp: isoNow(),
    label: `Hook [${phase}]: ${script}`,
    detail: ok ? "OK" : "failed",
    status: ok ? "ok" : "error",
  };
}

export function formatPolicyBlock(reason: string): DisplayEvent {
  return {
    type: "policy",
    timestamp: isoNow(),
    label: "Blocked by policy",
    detail: reason,
    status: "blocked",
  };
}

export function formatSlotChange(slotName: string, operation: string): DisplayEvent {
  return {
    type: "slot",
    timestamp: isoNow(),
    label: `Slot: ${operation} ${slotName}`,
    detail: "",
    status: "ok",
  };
}

export function formatHandoff(path: string): DisplayEvent {
  return {
    type: "handoff",
    timestamp: isoNow(),
    label: "Handoff saved",
    detail: path,
    status: "ok",
  };
}

export function renderCompact(event: DisplayEvent, index: number): string {
  const icon = event.status === "ok" ? " ✅" : event.status === "error" ? " ❌" : event.status === "blocked" ? " 🚫" : " ⏳";
  return `${index + 1}.${icon} ${event.label} — ${event.detail}`;
}

function isoNow(): string {
  return new Date().toISOString();
}
