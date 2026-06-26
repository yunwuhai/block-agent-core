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

export interface SaveTurnParams {
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

export async function saveTurn(params: SaveTurnParams): Promise<SavedTurn> {
  const mdContent = renderTurnMd(params.turn);
  await mkdir(dirname(params.turnMdPath), { recursive: true });
  const tmpMdPath = params.turnMdPath + ".tmp";
  await writeFile(tmpMdPath, mdContent, "utf-8");
  renameSync(tmpMdPath, params.turnMdPath);

  const turnRecord = await appendTurn(params.turnsPath, params.turnId, params.turnMdPath, params.turn);

  const toolCallRecords = [];
  for (let i = 0; i < params.toolCalls.length; i++) {
    const call = params.toolCalls[i]!;
    const id = params.toolCallIds[i] ?? `call-${String(i + 1).padStart(3, "0")}`;
    toolCallRecords.push(await appendToolCall(params.toolsPath, id, call));
  }

  const fileRefRecords = [];
  for (let i = 0; i < params.fileRefs.length; i++) {
    const ref = params.fileRefs[i]!;
    const id = params.refIds[i] ?? `ref-${String(i + 1).padStart(3, "0")}`;
    fileRefRecords.push(await appendFileRef(params.refsPath, id, ref));
  }

  const callRecordRecord = await appendCallRecord(params.callRecordsPath, params.callRecordId, params.callRecord);

  return {
    turnMdPath: params.turnMdPath,
    turnRecord,
    toolCallRecords,
    fileRefRecords,
    callRecord: callRecordRecord,
  };
}
