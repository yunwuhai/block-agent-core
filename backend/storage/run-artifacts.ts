import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EventEntry, RunDirectory } from "./event-log.ts";
import { appendEvent, readEvents } from "./event-log.ts";
import { writeHandoff } from "../output/handoff-store.ts";
import type { FileTouch, HandoffBlock, ToolSummary } from "../output/handoff-store.ts";
import { buildTranscript } from "../output/transcript-projector.ts";

type RunStatus = "completed" | "failed" | "blocked";
type FileOperation = "read" | "write" | "edit" | "delete" | "bash";

export interface GenerateRunArtifactsInput {
  readonly runId: string;
  readonly profile: string;
  readonly task: string;
  readonly status: RunStatus;
  readonly exitCode: number;
  readonly isContinuation: boolean;
  readonly eventCount: number;
  readonly accomplished: readonly string[];
  readonly includeToolAccomplishments: boolean;
  readonly pending: readonly string[];
  readonly startedAt?: string;
}

export interface GenerateRunArtifactsResult {
  readonly handoffPath: string;
  readonly transcriptMarkdown?: string;
  readonly transcriptPath?: string;
  readonly transcriptError?: string;
}

export async function generateRunArtifacts(
  run: RunDirectory,
  input: GenerateRunArtifactsInput,
): Promise<GenerateRunArtifactsResult> {
  const transcript = await generateTranscriptArtifact(run, input.runId);
  const rawEvents = await readRawEventsForArtifacts(run);
  const filesTouched = extractFilesTouched(rawEvents);
  const toolSummary = extractToolSummary(rawEvents);
  const blockContext = extractBlockContext(rawEvents);
  const accomplished = buildAccomplished(input, filesTouched);

  const handoffBlock: HandoffBlock = {
    runId: input.runId,
    profile: input.profile,
    agent: "efficiency-subagent",
    status: input.status,
    exitCode: input.exitCode,
    isContinuation: input.isContinuation,
    endedAt: new Date().toISOString(),
    summary: {
      task: input.task,
      result: summarizeRunResult(input.status, input.eventCount),
      accomplished,
      pending: [...input.pending],
    },
    artifacts: [
      { path: run.eventsPath, description: "Structured event log (JSONL format)" },
      { path: run.toolsPath, description: "Tool call/result log (JSONL format)" },
      { path: run.handoffPath, description: "This handoff document" },
    ],
    task: input.task,
    ...(input.startedAt !== undefined ? { startedAt: input.startedAt } : {}),
    ...(filesTouched.length > 0 ? { filesTouched } : {}),
    ...(toolSummary.length > 0 ? { toolSummary } : {}),
    ...(transcript.markdown !== undefined ? { finalOutput: transcript.markdown.slice(0, 4000) } : {}),
    ...(blockContext !== undefined ? { blockContext } : {}),
  };

  const handoffPath = await writeHandoff(run, handoffBlock);
  await appendEvent(run, {
    timestamp: new Date().toISOString(),
    runId: input.runId,
    event: "handoff_written",
    path: handoffPath,
  });

  return {
    handoffPath,
    ...(transcript.markdown !== undefined ? { transcriptMarkdown: transcript.markdown } : {}),
    ...(transcript.path !== undefined ? { transcriptPath: transcript.path } : {}),
    ...(transcript.error !== undefined ? { transcriptError: transcript.error } : {}),
  };
}

function buildAccomplished(
  input: GenerateRunArtifactsInput,
  filesTouched: readonly FileTouch[],
): string[] {
  const accomplished = [...input.accomplished];
  if (input.includeToolAccomplishments) {
    for (const file of filesTouched) {
      accomplished.push(`Tool: ${file.operation} ${file.path}`);
    }
    accomplished.push("Generated transcript");
  }
  return accomplished;
}

async function generateTranscriptArtifact(
  run: RunDirectory,
  runId: string,
): Promise<{ readonly markdown?: string; readonly path?: string; readonly error?: string }> {
  try {
    const transcriptView = await buildTranscript(run);
    const transcriptMarkdown = transcriptView.markdown;

    if (transcriptMarkdown) {
      const transcriptPath = join(run.dir, "transcript.md");
      await writeFile(transcriptPath, transcriptMarkdown, "utf-8");
      return { markdown: transcriptMarkdown, path: transcriptPath };
    }

    return { markdown: transcriptMarkdown };
  } catch (err) {
    const error = stringifyUnknownError(err);
    await appendEvent(run, {
      timestamp: new Date().toISOString(),
      runId,
      event: "transcript_error",
      error,
    });
    return { error };
  }
}

async function readRawEventsForArtifacts(run: RunDirectory): Promise<EventEntry[]> {
  try {
    return await readEvents(run);
  } catch (err) {
    stringifyUnknownError(err);
    return [];
  }
}

function summarizeRunResult(status: RunStatus, eventCount: number): string {
  switch (status) {
    case "completed":
      return `Run completed successfully with ${eventCount} events.`;
    case "blocked":
      return `Run blocked. ${eventCount} events recorded.`;
    case "failed":
      return `Run failed with ${eventCount} events.`;
  }
}

function stringifyUnknownError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function extractFilesTouched(
  rawEvents: readonly EventEntry[],
): FileTouch[] {
  const result: { path: string; operation: FileOperation }[] = [];
  for (const e of rawEvents) {
    if (e.event !== "tool_call") continue;
    const toolName = String(e.toolName ?? "read");
    const args = eventArguments(e);
    const operation = mapToolToOperation(toolName);
    const filePath = extractFilePath(toolName, args);
    if (filePath) {
      result.push({ path: filePath, operation });
    }
  }
  return result;
}

export function mapToolToOperation(toolName: string): FileOperation {
  switch (toolName) {
    case "write":
      return "write";
    case "edit":
      return "edit";
    case "delete":
      return "delete";
    case "bash":
      return "bash";
    default:
      return "read";
  }
}

export function extractFilePath(
  toolName: string,
  args: Record<string, unknown>,
): string | undefined {
  if (toolName === "bash") {
    return typeof args.command === "string" ? args.command : undefined;
  }
  return (typeof args.path === "string" && args.path) ||
    (typeof args.filePath === "string" && args.filePath) ||
    undefined;
}

export function extractToolSummary(rawEvents: readonly EventEntry[]): ToolSummary[] {
  const counts = new Map<string, number>();
  for (const e of rawEvents) {
    if (e.event !== "tool_call") continue;
    const toolName = String(e.toolName ?? "read");
    counts.set(toolName, (counts.get(toolName) ?? 0) + 1);
  }
  return Array.from(counts, ([toolName, count]) => ({ toolName, count }));
}

export function extractBlockContext(
  rawEvents: readonly EventEntry[],
): HandoffBlock["blockContext"] {
  for (const e of rawEvents) {
    if (e.event !== "policy_block") continue;
    return {
      reason: String(e.reason ?? "policy violation"),
      ...(typeof e.triggeredBy === "string" ? { triggeredBy: e.triggeredBy } : {}),
      ...(typeof e.policyRule === "string" ? { policyRule: e.policyRule } : {}),
      ...(typeof e.suggestion === "string" ? { suggestion: e.suggestion } : {}),
    };
  }
  return undefined;
}

function eventArguments(event: EventEntry): Record<string, unknown> {
  return isRecord(event.arguments) ? event.arguments : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
