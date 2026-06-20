import type { EventEntry, ToolLogEntry, RunDirectory } from "./event-log.ts";
import { readEvents } from "./event-log.ts";

export interface TranscriptView {
  readonly runId: string;
  readonly markdown: string;
}

export async function buildTranscript(run: RunDirectory): Promise<TranscriptView> {
  const events = await readEvents(run);
  const lines: string[] = [
    `# Run Transcript: ${run.runId}`,
    "",
    ...events.map(formatEvent),
  ];
  return { runId: run.runId, markdown: lines.join("\n") };
}

function formatEvent(e: EventEntry): string {
  const ts = e.timestamp;
  switch (e.event) {
    case "run_start":
      return `## Run Started\n\n- **Profile**: ${e.profile ?? "unknown"}\n- **Task**: ${e.task ?? ""}\n- **Time**: ${ts}`;
    case "run_end":
      return `## Run ${e.status ?? "ended"}\n\n- **Exit code**: ${e.exitCode ?? "?"}\n- **Time**: ${ts}`;
    case "tool_call":
      return `### Tool: \`${e.toolName ?? "?"}\`\n\n- **Arguments**: \`\`\`json\n${JSON.stringify(e.arguments ?? {}, null, 2)}\n\`\`\``;
    case "tool_result":
      return `### Result: \`${e.toolName ?? "?"}\`${e.isError === true ? " ❌ error" : ""}\n\n${typeof e.output === "string" ? e.output.slice(0, 2000) : "(no output)"}`;
    case "hook_exec":
      return `### Hook: ${e.phase ?? "?"} (${e.script ?? "?"})\n\n- **Exit**: ${e.exitCode ?? "?"}`;
    case "policy_block":
      return `### 🚫 Blocked: ${e.reason ?? "policy violation"}\n\n- **Tool**: \`${e.toolName ?? "?"}\``;
    case "slot_mutation":
      return `### Slot: ${e.operation ?? "?"} \`${e.slotName ?? "?"}\``;
    case "handoff_written":
      return `### Handoff written\n\n- **Path**: \`${e.path ?? "?"}\``;
    default:
      return `### ${e.event}\n\n\`\`\`json\n${JSON.stringify(e, null, 2)}\n\`\`\``;
  }
}

export type { EventEntry, ToolLogEntry };
export type { RunDirectory };
