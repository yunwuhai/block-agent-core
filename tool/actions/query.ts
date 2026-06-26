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

interface QueryParams {
  table: TableName;
  tablePath: string;
  filter: Record<string, unknown>;
}

export async function handleQuery(
  params: QueryParams,
  _ctx: ExtensionContext,
): Promise<{ content: Array<{ type: "text"; text: string }>; details: unknown }> {
  let results: unknown[];
  switch (params.table) {
    case "turns":
      results = await queryTurns(params.tablePath, params.filter as TurnFilter);
      break;
    case "toolCalls":
      results = await queryToolCalls(params.tablePath, params.filter as ToolCallFilter);
      break;
    case "templates":
      results = await queryTemplates(params.tablePath, params.filter as TemplateFilter);
      break;
    case "fileRefs":
      results = await queryFileRefs(params.tablePath, params.filter as FileRefFilter);
      break;
    case "callRecords":
      results = await queryCallRecords(params.tablePath, params.filter as CallRecordFilter);
      break;
    case "recipes": {
      const recipes = await loadRecipes(params.tablePath);
      const f = params.filter as { ids?: string[] };
      results = f.ids ? recipes.filter(r => new Set(f.ids).has(r.id)) : recipes;
      break;
    }
    default:
      return { content: [{ type: "text", text: `Unknown table: ${params.table}` }], details: {} as any };
  }
  return {
    content: [{
      type: "text",
      text: `Found ${results.length} record(s) in ${params.table}:\n${JSON.stringify(results, null, 2)}`,
    }],
    details: {} as any,
  };
}
