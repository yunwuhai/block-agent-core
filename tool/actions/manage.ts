// tool/actions/manage.ts
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { appendTurn, updateTurn } from "../../core/turns.ts";
import { appendToolCall, updateToolCall } from "../../core/tool-calls.ts";
import { appendTemplate, updateTemplate } from "../../core/templates.ts";
import { appendFileRef, updateFileRef } from "../../core/file-refs.ts";
import { appendCallRecord, updateCallRecord } from "../../core/call-records.ts";
import { addRecipe, updateRecipe } from "../../core/recipes.ts";
import { deleteJsonl } from "../../utils/jsonl.ts";
import type { TurnInput, ToolCallInput, TemplateInput, FileRefInput, CallRecordInput, Recipe } from "../../core/types.ts";

type TableName = "turns" | "toolCalls" | "templates" | "fileRefs" | "callRecords" | "recipes";
type Op = "get" | "append" | "update" | "delete";

interface ManageParams {
  table: TableName;
  tablePath: string;
  op: Op;
  id: string;
  data: Record<string, unknown>;
}

export async function handleManage(
  params: ManageParams,
  ctx: ExtensionContext,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  if ((params.op === "append" || params.op === "update" || params.op === "delete") && ctx.hasUI) {
    const ok = await ctx.ui.confirm(
      "Manage Records",
      `About to ${params.op} a record in ${params.table} (${params.tablePath}). Proceed?`,
    );
    if (!ok) return { content: [{ type: "text", text: "Operation cancelled by user." }] };
  }

  try {
    switch (params.table) {
      case "turns": {
        if (params.op === "append") {
          const d = params.data as unknown as TurnInput & { turnMdPath: string };
          const r = await appendTurn(params.tablePath, params.id, d.turnMdPath, d);
          return { content: [{ type: "text", text: `Turn appended: ${JSON.stringify(r)}` }] };
        }
        if (params.op === "update") { await updateTurn(params.tablePath, params.id, params.data); return { content: [{ type: "text", text: `Turn ${params.id} updated.` }] }; }
        if (params.op === "delete") { await deleteJsonl(params.tablePath, params.id); return { content: [{ type: "text", text: `Turn ${params.id} deleted.` }] }; }
        break;
      }
      case "toolCalls": {
        if (params.op === "append") {
          const r = await appendToolCall(params.tablePath, params.id, params.data as unknown as ToolCallInput);
          return { content: [{ type: "text", text: `ToolCall appended: ${JSON.stringify(r)}` }] };
        }
        if (params.op === "update") { await updateToolCall(params.tablePath, params.id, params.data); return { content: [{ type: "text", text: `ToolCall ${params.id} updated.` }] }; }
        if (params.op === "delete") { await deleteJsonl(params.tablePath, params.id); return { content: [{ type: "text", text: `ToolCall ${params.id} deleted.` }] }; }
        break;
      }
      case "templates": {
        if (params.op === "append") {
          const d = params.data as unknown as TemplateInput & { templateMdPath: string };
          const r = await appendTemplate(params.tablePath, params.id, d.templateMdPath, d);
          return { content: [{ type: "text", text: `Template appended: ${JSON.stringify(r)}` }] };
        }
        if (params.op === "update") { await updateTemplate(params.tablePath, params.id, params.data); return { content: [{ type: "text", text: `Template ${params.id} updated.` }] }; }
        if (params.op === "delete") { await deleteJsonl(params.tablePath, params.id); return { content: [{ type: "text", text: `Template ${params.id} deleted.` }] }; }
        break;
      }
      case "fileRefs": {
        if (params.op === "append") {
          const r = await appendFileRef(params.tablePath, params.id, params.data as unknown as FileRefInput);
          return { content: [{ type: "text", text: `FileRef appended: ${JSON.stringify(r)}` }] };
        }
        if (params.op === "update") { await updateFileRef(params.tablePath, params.id, params.data); return { content: [{ type: "text", text: `FileRef ${params.id} updated.` }] }; }
        if (params.op === "delete") { await deleteJsonl(params.tablePath, params.id); return { content: [{ type: "text", text: `FileRef ${params.id} deleted.` }] }; }
        break;
      }
      case "callRecords": {
        if (params.op === "append") {
          const r = await appendCallRecord(params.tablePath, params.id, params.data as unknown as CallRecordInput);
          return { content: [{ type: "text", text: `CallRecord appended: ${JSON.stringify(r)}` }] };
        }
        if (params.op === "update") { await updateCallRecord(params.tablePath, params.id, params.data); return { content: [{ type: "text", text: `CallRecord ${params.id} updated.` }] }; }
        if (params.op === "delete") { await deleteJsonl(params.tablePath, params.id); return { content: [{ type: "text", text: `CallRecord ${params.id} deleted.` }] }; }
        break;
      }
      case "recipes": {
        if (params.op === "append") { await addRecipe(params.tablePath, params.data as unknown as Recipe); return { content: [{ type: "text", text: "Recipe added." }] }; }
        if (params.op === "update") { const ok = await updateRecipe(params.tablePath, params.id, params.data); return { content: [{ type: "text", text: ok ? `Recipe ${params.id} updated.` : `Recipe ${params.id} not found.` }] }; }
        break;
      }
    }
    return { content: [{ type: "text", text: `Unknown table/op: ${params.table}/${params.op}` }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }] };
  }
}
