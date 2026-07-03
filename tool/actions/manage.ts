// tool/actions/manage.ts
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { deleteJsonl } from "../../utils/jsonl.ts";
import { getTurn, appendTurn, updateTurn } from "../../core/turns.ts";
import { getToolCall, appendToolCall, updateToolCall } from "../../core/tool-calls.ts";
import { getTemplate, appendTemplate, updateTemplate } from "../../core/templates.ts";
import { getFileRef, appendFileRef, updateFileRef } from "../../core/file-refs.ts";
import { getCallRecord, appendCallRecord, updateCallRecord } from "../../core/call-records.ts";
import { getRecipe, addRecipe, updateRecipe } from "../../core/recipes.ts";
import type { Recipe } from "../../core/types.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type TableName = "turns" | "toolCalls" | "templates" | "fileRefs" | "callRecords" | "recipes";
type Op = "get" | "append" | "update" | "delete";
type HandlerResult = { content: Array<{ type: "text"; text: string }>; details: unknown };
type Handler = (path: string, id: string, data: Record<string, unknown>) => HandlerResult | Promise<HandlerResult>;

interface ManageParams {
  table: TableName;
  tablePath: string;
  op: Op;
  id: string;
  data: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function ok(text: string): HandlerResult {
  return { content: [{ type: "text" as const, text }], details: {} as any };
}

/** Build all-4-op handlers for a standard JSONL-backed table. */
function jsonlHandlers(
  label: string,
  getFn: (path: string, id: string) => Promise<unknown>,
  updateFn: (path: string, id: string, patch: any) => Promise<boolean>,
  appendFn: (path: string, id: string, data: any, extra?: unknown) => Promise<unknown>,
): Record<Op, Handler> {
  return {
    get: async (path, id) => {
      const r = await getFn(path, id);
      return ok(r ? JSON.stringify(r, null, 2) : `${label} ${id} not found.`);
    },
    append: async (path, id, data) => {
      const r = await appendFn(path, id, data);
      return ok(`${label} appended: ${JSON.stringify(r)}`);
    },
    update: async (path, id, data) => {
      await updateFn(path, id, data);
      return ok(`${label} ${id} updated.`);
    },
    delete: async (path, id) => {
      await deleteJsonl(path, id);
      return ok(`${label} ${id} deleted.`);
    },
  };
}

// ---------------------------------------------------------------------------
// Registry — table name → { op → handler }
// ---------------------------------------------------------------------------
const registry: Record<TableName, Partial<Record<Op, Handler>>> = {
  turns: jsonlHandlers("Turn", getTurn, updateTurn, (path, id, data) => {
    const d = data as any;
    return appendTurn(path, id, d.turnMdPath ?? `turns/${id}.md`, d);
  }),

  toolCalls: jsonlHandlers("ToolCall", getToolCall, updateToolCall, (path, id, data) =>
    appendToolCall(path, id, data as any),
  ),

  templates: jsonlHandlers("Template", getTemplate, updateTemplate, (path, id, data) => {
    const d = data as any;
    return appendTemplate(path, id, d.templateMdPath ?? d.path, d);
  }),

  fileRefs: jsonlHandlers("FileRef", getFileRef, updateFileRef, (path, id, data) =>
    appendFileRef(path, id, data as any),
  ),

  callRecords: jsonlHandlers("CallRecord", getCallRecord, updateCallRecord, (path, id, data) =>
    appendCallRecord(path, id, data as any),
  ),

  // recipes uses TOML, not JSONL — different interface, no delete
  recipes: {
    get: async (path, id) => {
      const r = await getRecipe(path, id);
      return ok(r ? JSON.stringify(r, null, 2) : `Recipe ${id} not found.`);
    },
    append: async (path, _id, data) => {
      await addRecipe(path, data as unknown as Recipe);
      return ok("Recipe added.");
    },
    update: async (path, id, data) => {
      const found = await updateRecipe(path, id, data);
      return ok(found ? `Recipe ${id} updated.` : `Recipe ${id} not found.`);
    },
  },
};

// ---------------------------------------------------------------------------
// Public API (unchanged signature)
// ---------------------------------------------------------------------------
export async function handleManage(
  params: ManageParams,
  ctx: ExtensionContext,
): Promise<HandlerResult> {
  if ((params.op === "append" || params.op === "update" || params.op === "delete") && ctx.hasUI) {
    const confirmed = await ctx.ui.confirm(
      "Manage Records",
      `About to ${params.op} a record in ${params.table} (${params.tablePath}). Proceed?`,
    );
    if (!confirmed) return ok("Operation cancelled by user.");
  }

  try {
    const handler = registry[params.table]?.[params.op];
    if (!handler) return ok(`Unknown table/op: ${params.table}/${params.op}`);
    return await handler(params.tablePath, params.id, params.data);
  } catch (err) {
    return ok(`Error: ${(err as Error).message}`);
  }
}
