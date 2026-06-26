// tool/actions/manage.ts
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { appendTurn, getTurn, updateTurn } from "../../core/turns.ts";
import { appendToolCall, getToolCall, updateToolCall } from "../../core/tool-calls.ts";
import { appendTemplate, getTemplate, updateTemplate } from "../../core/templates.ts";
import { appendFileRef, getFileRef, updateFileRef } from "../../core/file-refs.ts";
import { appendCallRecord, getCallRecord, updateCallRecord } from "../../core/call-records.ts";
import { addRecipe, getRecipe, updateRecipe } from "../../core/recipes.ts";
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
): Promise<{ content: Array<{ type: "text"; text: string }>; details: unknown }> {
  if ((params.op === "append" || params.op === "update" || params.op === "delete") && ctx.hasUI) {
    const ok = await ctx.ui.confirm(
      "Manage Records",
      `About to ${params.op} a record in ${params.table} (${params.tablePath}). Proceed?`,
    );
    if (!ok) return { content: [{ type: "text", text: "Operation cancelled by user." }], details: {} as any };
  }

  try {
    switch (params.table) {
      case "turns": {
        if (params.op === "get") {
          const r = await getTurn(params.tablePath, params.id);
          return { content: [{ type: "text", text: r ? JSON.stringify(r, null, 2) : `Turn ${params.id} not found.` }], details: {} as any };
        }
        if (params.op === "append") {
          const d = params.data as unknown as TurnInput & { turnMdPath: string };
          const r = await appendTurn(params.tablePath, params.id, d.turnMdPath, d);
          return { content: [{ type: "text", text: `Turn appended: ${JSON.stringify(r)}` }], details: {} as any };
        }
        if (params.op === "update") { await updateTurn(params.tablePath, params.id, params.data); return { content: [{ type: "text", text: `Turn ${params.id} updated.` }], details: {} as any }; }
        if (params.op === "delete") { await deleteJsonl(params.tablePath, params.id); return { content: [{ type: "text", text: `Turn ${params.id} deleted.` }], details: {} as any }; }
        break;
      }
      case "toolCalls": {
        if (params.op === "get") {
          const r = await getToolCall(params.tablePath, params.id);
          return { content: [{ type: "text", text: r ? JSON.stringify(r, null, 2) : `ToolCall ${params.id} not found.` }], details: {} as any };
        }
        if (params.op === "append") {
          const r = await appendToolCall(params.tablePath, params.id, params.data as unknown as ToolCallInput);
          return { content: [{ type: "text", text: `ToolCall appended: ${JSON.stringify(r)}` }], details: {} as any };
        }
        if (params.op === "update") { await updateToolCall(params.tablePath, params.id, params.data); return { content: [{ type: "text", text: `ToolCall ${params.id} updated.` }], details: {} as any }; }
        if (params.op === "delete") { await deleteJsonl(params.tablePath, params.id); return { content: [{ type: "text", text: `ToolCall ${params.id} deleted.` }], details: {} as any }; }
        break;
      }
      case "templates": {
        if (params.op === "get") {
          const r = await getTemplate(params.tablePath, params.id);
          return { content: [{ type: "text", text: r ? JSON.stringify(r, null, 2) : `Template ${params.id} not found.` }], details: {} as any };
        }
        if (params.op === "append") {
          const d = params.data as unknown as TemplateInput & { templateMdPath: string };
          const r = await appendTemplate(params.tablePath, params.id, d.templateMdPath, d);
          return { content: [{ type: "text", text: `Template appended: ${JSON.stringify(r)}` }], details: {} as any };
        }
        if (params.op === "update") { await updateTemplate(params.tablePath, params.id, params.data); return { content: [{ type: "text", text: `Template ${params.id} updated.` }], details: {} as any }; }
        if (params.op === "delete") { await deleteJsonl(params.tablePath, params.id); return { content: [{ type: "text", text: `Template ${params.id} deleted.` }], details: {} as any }; }
        break;
      }
      case "fileRefs": {
        if (params.op === "get") {
          const r = await getFileRef(params.tablePath, params.id);
          return { content: [{ type: "text", text: r ? JSON.stringify(r, null, 2) : `FileRef ${params.id} not found.` }], details: {} as any };
        }
        if (params.op === "append") {
          const r = await appendFileRef(params.tablePath, params.id, params.data as unknown as FileRefInput);
          return { content: [{ type: "text", text: `FileRef appended: ${JSON.stringify(r)}` }], details: {} as any };
        }
        if (params.op === "update") { await updateFileRef(params.tablePath, params.id, params.data); return { content: [{ type: "text", text: `FileRef ${params.id} updated.` }], details: {} as any }; }
        if (params.op === "delete") { await deleteJsonl(params.tablePath, params.id); return { content: [{ type: "text", text: `FileRef ${params.id} deleted.` }], details: {} as any }; }
        break;
      }
      case "callRecords": {
        if (params.op === "get") {
          const r = await getCallRecord(params.tablePath, params.id);
          return { content: [{ type: "text", text: r ? JSON.stringify(r, null, 2) : `CallRecord ${params.id} not found.` }], details: {} as any };
        }
        if (params.op === "append") {
          const r = await appendCallRecord(params.tablePath, params.id, params.data as unknown as CallRecordInput);
          return { content: [{ type: "text", text: `CallRecord appended: ${JSON.stringify(r)}` }], details: {} as any };
        }
        if (params.op === "update") { await updateCallRecord(params.tablePath, params.id, params.data); return { content: [{ type: "text", text: `CallRecord ${params.id} updated.` }], details: {} as any }; }
        if (params.op === "delete") { await deleteJsonl(params.tablePath, params.id); return { content: [{ type: "text", text: `CallRecord ${params.id} deleted.` }], details: {} as any }; }
        break;
      }
      case "recipes": {
        if (params.op === "get") {
          const r = await getRecipe(params.tablePath, params.id);
          return { content: [{ type: "text", text: r ? JSON.stringify(r, null, 2) : `Recipe ${params.id} not found.` }], details: {} as any };
        }
        if (params.op === "append") { await addRecipe(params.tablePath, params.data as unknown as Recipe); return { content: [{ type: "text", text: "Recipe added." }], details: {} as any }; }
        if (params.op === "update") { const ok = await updateRecipe(params.tablePath, params.id, params.data); return { content: [{ type: "text", text: ok ? `Recipe ${params.id} updated.` : `Recipe ${params.id} not found.` }], details: {} as any }; }
        break;
      }
    }
    return { content: [{ type: "text", text: `Unknown table/op: ${params.table}/${params.op}` }], details: {} as any };
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], details: {} as any };
  }
}
