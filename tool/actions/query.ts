// tool/actions/query.ts
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { queryTurns } from "../../core/turns.ts";
import { queryToolCalls } from "../../core/tool-calls.ts";
import { queryTemplates } from "../../core/templates.ts";
import { queryFileRefs } from "../../core/file-refs.ts";
import { queryCallRecords } from "../../core/call-records.ts";
import { loadRecipes } from "../../core/recipes.ts";
import type { TurnFilter, ToolCallFilter, TemplateFilter, FileRefFilter, CallRecordFilter } from "../../core/types.ts";

type TableName = "turns" | "toolCalls" | "templates" | "fileRefs" | "callRecords" | "recipes";
type QueryFn = (tablePath: string, filter: Record<string, unknown>) => Promise<unknown[]>;

const queryRegistry: Record<TableName, QueryFn> = {
  turns: (path, filter) => queryTurns(path, filter as TurnFilter),
  toolCalls: (path, filter) => queryToolCalls(path, filter as ToolCallFilter),
  templates: (path, filter) => queryTemplates(path, filter as TemplateFilter),
  fileRefs: (path, filter) => queryFileRefs(path, filter as FileRefFilter),
  callRecords: (path, filter) => queryCallRecords(path, filter as CallRecordFilter),
  recipes: async (path, filter) => {
    const recipes = await loadRecipes(path);
    const f = filter as { ids?: string[] };
    return f.ids ? recipes.filter(r => new Set(f.ids).has(r.id)) : recipes;
  },
};

interface QueryParams {
  table: TableName;
  tablePath: string;
  filter: Record<string, unknown>;
}

export async function handleQuery(
  params: QueryParams,
  _ctx: ExtensionContext,
): Promise<{ content: Array<{ type: "text"; text: string }>; details: unknown }> {
  const qf = queryRegistry[params.table];
  if (!qf) {
    return { content: [{ type: "text", text: `Unknown table: ${params.table}` }], details: {} as any };
  }
  const results = await qf(params.tablePath, params.filter);
  return {
    content: [{
      type: "text",
      text: `Found ${results.length} record(s) in ${params.table}:\n${JSON.stringify(results, null, 2)}`,
    }],
    details: {} as any,
  };
}
