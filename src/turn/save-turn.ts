import { writeFile, mkdir } from "node:fs/promises";
import { renameSync } from "node:fs";
import { dirname } from "node:path";
import { appendTurn } from "./turns.ts";
import { appendToolCall } from "./tool-calls.ts";
import { appendFileRef } from "./file-refs.ts";
import { appendCallRecord } from "./call-records.ts";
import type {
  TurnInput, ToolCallInput, FileRefInput, CallRecordInput, SavedTurn,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sequentialId(prefix: string, sequenceNo: number, padLength: number = 3): string {
  return `${prefix}-${String(sequenceNo).padStart(padLength, "0")}`;
}

function renderTurnMd(turn: TurnInput): string {
  const lines: string[] = [];
  lines.push("## User");
  lines.push("");
  lines.push(turn.userText);

  for (const block of turn.assistantBlocks) {
    if (block.type === "text") {
      lines.push("");
      lines.push("## Assistant");
      lines.push("");
      lines.push(block.text);
    } else if (block.type === "tool") {
      lines.push("");
      lines.push(`## Assistant (tool: ${block.toolName})`);
      lines.push("");
      lines.push("**Params:**");
      lines.push("```json");
      lines.push(JSON.stringify(block.params, null, 2));
      lines.push("```");
      lines.push("");
      lines.push("**Result:**");
      for (const c of block.content) {
        if (c.type === "text" && c.text) lines.push(c.text);
        else if (c.type === "image") {
          lines.push(`[Image: ${c.mimeType ?? "unknown"}]`);
        }
      }
    }
  }
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Types: grouped vs flat (backward compatible)
// ---------------------------------------------------------------------------

export interface PathsGroup {
  turnsPath: string;
  turnMdPath: string;
  toolsPath: string;
  refsPath: string;
  callRecordsPath: string;
}

export interface IdsGroup {
  turnId: string;
  toolCallIds: string[];
  refIds: string[];
  callRecordId: string;
}

/** Flat params — original 14-field format (kept for backward compatibility). */
export interface SaveTurnFlatParams {
  turnsPath: string;
  turnMdPath: string;
  toolsPath: string;
  refsPath: string;
  callRecordsPath: string;
  turnId: string;
  toolCallIds: string[];
  refIds: string[];
  callRecordId: string;
  turn: TurnInput;
  toolCalls: ToolCallInput[];
  fileRefs: FileRefInput[];
  callRecord: CallRecordInput;
}

/** Grouped params — paths and IDs nested under their own objects. */
export interface SaveTurnGroupedParams {
  paths: PathsGroup;
  ids: IdsGroup;
  turn: TurnInput;
  toolCalls: ToolCallInput[];
  fileRefs: FileRefInput[];
  callRecord: CallRecordInput;
}

export type SaveTurnParams = SaveTurnFlatParams | SaveTurnGroupedParams;

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

interface Normalized {
  paths: PathsGroup;
  ids: IdsGroup;
  turn: TurnInput;
  toolCalls: ToolCallInput[];
  fileRefs: FileRefInput[];
  callRecord: CallRecordInput;
}

function normalizeParams(params: SaveTurnParams): Normalized {
  if ("paths" in params) {
    return params as SaveTurnGroupedParams;
  }
  const p = params as SaveTurnFlatParams;
  return {
    paths: {
      turnsPath: p.turnsPath,
      turnMdPath: p.turnMdPath,
      toolsPath: p.toolsPath,
      refsPath: p.refsPath,
      callRecordsPath: p.callRecordsPath,
    },
    ids: {
      turnId: p.turnId,
      toolCallIds: p.toolCallIds,
      refIds: p.refIds,
      callRecordId: p.callRecordId,
    },
    turn: p.turn,
    toolCalls: p.toolCalls,
    fileRefs: p.fileRefs,
    callRecord: p.callRecord,
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function saveTurn(params: SaveTurnParams): Promise<SavedTurn> {
  const { paths, ids, turn, toolCalls, fileRefs, callRecord } = normalizeParams(params);

  const mdContent = renderTurnMd(turn);
  await mkdir(dirname(paths.turnMdPath), { recursive: true });
  const tmpMdPath = paths.turnMdPath + ".tmp";
  await writeFile(tmpMdPath, mdContent, "utf-8");
  renameSync(tmpMdPath, paths.turnMdPath);

  const turnRecord = await appendTurn(paths.turnsPath, ids.turnId, paths.turnMdPath, turn);

  const toolCallRecords = [];
  for (let i = 0; i < toolCalls.length; i++) {
    const call = toolCalls[i]!;
    const id = ids.toolCallIds[i] ?? sequentialId("call", i + 1);
    toolCallRecords.push(await appendToolCall(paths.toolsPath, id, call));
  }

  const fileRefRecords = [];
  for (let i = 0; i < fileRefs.length; i++) {
    const ref = fileRefs[i]!;
    const id = ids.refIds[i] ?? sequentialId("ref", i + 1);
    fileRefRecords.push(await appendFileRef(paths.refsPath, id, ref));
  }

  const callRecordRecord = await appendCallRecord(paths.callRecordsPath, ids.callRecordId, callRecord);

  return {
    turnMdPath: paths.turnMdPath,
    turnRecord,
    toolCallRecords,
    fileRefRecords,
    callRecord: callRecordRecord,
  };
}
