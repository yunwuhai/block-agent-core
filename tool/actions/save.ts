// tool/actions/save.ts
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { saveTurn } from "../../core/save-turn.ts";
import type { TurnInput, ToolCallInput, FileRefInput, CallRecordInput } from "../../core/types.ts";

interface SaveParams {
  turnsPath: string; turnMdPath: string; toolsPath: string;
  refsPath: string; callRecordsPath: string;
  turnId: string; toolCallIds: string[]; refIds: string[]; callRecordId: string;
  turn: TurnInput; toolCalls: ToolCallInput[];
  fileRefs: FileRefInput[]; callRecord: CallRecordInput;
}

export async function handleSave(
  params: SaveParams,
  ctx: ExtensionContext,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  if (ctx.hasUI) {
    const paths = [params.turnMdPath, params.turnsPath, params.toolsPath, params.refsPath, params.callRecordsPath];
    const ok = await ctx.ui.confirm(
      "Save Turn",
      `About to write to:\n${paths.map(p => `  - ${p}`).join("\n")}\n\nProceed?`,
    );
    if (!ok) return { content: [{ type: "text", text: "Save cancelled by user." }] };
  }

  try {
    const result = await saveTurn(params);
    return {
      content: [{
        type: "text",
        text: `Turn saved.\n- Turn: ${result.turnRecord.id}\n- ToolCalls: ${result.toolCallRecords.length}\n- FileRefs: ${result.fileRefRecords.length}\n- CallRecord: ${result.callRecord.id}`,
      }],
    };
  } catch (err) {
    return { content: [{ type: "text", text: `Error saving turn: ${(err as Error).message}` }] };
  }
}
