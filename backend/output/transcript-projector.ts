import type { Event, RunDirectory } from "../storage/mod.ts";
import { readEvents } from "../storage/mod.ts";

export interface TranscriptView {
  readonly runId: string;
  readonly markdown: string;
  readonly events?: Event[];
}

export interface TranscriptOptions {
  readonly includeJson?: boolean;
  readonly maxOutputLength?: number;
}

export async function buildTranscript(
  run: RunDirectory,
  options?: TranscriptOptions,
): Promise<TranscriptView> {
  const events = await readEvents(run.dir);
  const maxOutputLength = options?.maxOutputLength ?? 2000;
  const includeJson = options?.includeJson ?? false;

  const lines: string[] = [
    `# Run Transcript: ${run.dir}`,
    "",
    ...events.map((e) => formatEvent(e, maxOutputLength)),
  ];

  return {
    runId: run.dir,
    markdown: lines.join("\n"),
    ...(includeJson ? { events } : {}),
  };
}

export async function buildJsonTranscript(
  run: RunDirectory,
): Promise<Event[]> {
  return readEvents(run.dir);
}

function formatEvent(e: Event, maxOutputLength: number): string {
  const ts = e.timestamp;
  const d = e.data;
  switch (e.type) {
    case "run_start":
      return `## Run Started\n\n- **Profile**: ${d.profile ?? "unknown"}\n- **Task**: ${d.task ?? ""}\n- **Time**: ${ts}`;
    case "run_end":
      return `## Run ${d.status ?? "ended"}\n\n- **Time**: ${ts}`;
    case "tool_call":
      return `### Tool: \`${d.tool ?? "?"}\`\n\n- **Arguments**: \`\`\`json\n${JSON.stringify(d.args ?? {}, null, 2)}\n\`\`\``;
    case "tool_result": {
      const sliced =
        typeof d.output === "string"
          ? maxOutputLength === -1
            ? d.output
            : d.output.slice(0, maxOutputLength)
          : "(no output)";
      return `### Result: \`${d.tool ?? "?"}\`${d.isError === true ? " error" : ""}\n\n${sliced}`;
    }
    case "policy_block":
      return `### Blocked: ${d.reason ?? "policy violation"}\n\n- **Tool**: \`${d.tool ?? "?"}\``;
    case "slot_mutation":
      return `### Slot: ${d.operation ?? "?"} \`${d.slotName ?? "?"}\``;
    case "handoff_written":
      return `### Handoff written\n\n- **Path**: \`${d.path ?? "?"}\``;
    default:
      return `### ${e.type}\n\n\`\`\`json\n${JSON.stringify(e, null, 2)}\n\`\`\``;
  }
}
