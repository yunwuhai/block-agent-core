// tool/actions/save.ts
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { saveTurn } from "../../core/save-turn.ts";
import type { SaveTurnGroupedParams } from "../../core/save-turn.ts";

type SaveParams = SaveTurnGroupedParams;

export async function handleSave(
  params: SaveParams,
  ctx: ExtensionContext,
): Promise<{ content: Array<{ type: "text"; text: string }>; details: unknown }> {
  if (ctx.hasUI) {
    const pathList = [params.paths.turnMdPath, params.paths.turnsPath, params.paths.toolsPath,
                      params.paths.refsPath, params.paths.callRecordsPath];
    const ok = await ctx.ui.confirm(
      "Save Turn",
      `About to write to:\n${pathList.map(p => `  - ${p}`).join("\n")}\n\nProceed?`,
    );
    if (!ok) return { content: [{ type: "text", text: "Save cancelled by user." }], details: {} as any };
  }

  try {
    const result = await saveTurn(params);
    return {
      content: [{
        type: "text",
        text: `Turn saved.\n- Turn: ${result.turnRecord.id}\n- ToolCalls: ${result.toolCallRecords.length}\n- FileRefs: ${result.fileRefRecords.length}\n- CallRecord: ${result.callRecord.id}`,
      }],
      details: {} as any,
    };
  } catch (err) {
    return { content: [{ type: "text", text: `Error saving turn: ${(err as Error).message}` }], details: {} as any };
  }
}
