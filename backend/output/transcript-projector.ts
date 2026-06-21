import type { EventEntry, RunDirectory, ToolLogEntry } from "../storage/event-log.ts";
import { readEvents } from "../storage/event-log.ts";

export interface TranscriptView {
  readonly runId: string;
  readonly markdown: string;
  readonly events?: EventEntry[];
}

export interface TranscriptOptions {
  readonly includeJson?: boolean;
  readonly maxOutputLength?: number;
}

export async function buildTranscript(
  run: RunDirectory,
  options?: TranscriptOptions,
): Promise<TranscriptView> {
  const events = await readEvents(run);
  const maxOutputLength = options?.maxOutputLength ?? 2000;
  const includeJson = options?.includeJson ?? false;

  const lines: string[] = [
    `# Run Transcript: ${run.runId}`,
    "",
    ...events.map((e) => formatEvent(e, maxOutputLength)),
  ];

  return {
    runId: run.runId,
    markdown: lines.join("\n"),
    ...(includeJson ? { events } : {}),
  };
}

export async function buildJsonTranscript(
  run: RunDirectory,
): Promise<EventEntry[]> {
  return readEvents(run);
}

function formatEvent(e: EventEntry, maxOutputLength: number): string {
  const ts = e.timestamp;
  switch (e.event) {
    case "run_start":
      return `## Run Started\n\n- **Profile**: ${e.profile ?? "unknown"}\n- **Task**: ${e.task ?? ""}\n- **Time**: ${ts}`;
    case "run_end":
      return `## Run ${e.status ?? "ended"}\n\n- **Exit code**: ${e.exitCode ?? "?"}\n- **Time**: ${ts}`;
    case "tool_call":
      return `### Tool: \`${e.toolName ?? "?"}\`\n\n- **Arguments**: \`\`\`json\n${JSON.stringify(e.arguments ?? {}, null, 2)}\n\`\`\``;
    case "tool_result": {
      const sliced =
        typeof e.output === "string"
          ? maxOutputLength === -1
            ? e.output
            : e.output.slice(0, maxOutputLength)
          : "(no output)";
      return `### Result: \`${e.toolName ?? "?"}\`${e.isError === true ? " ❌ error" : ""}\n\n${sliced}`;
    }
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
