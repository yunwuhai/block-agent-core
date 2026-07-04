import { Type } from "typebox";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { handleArchiveResult } from "./actions/archive-result.ts";
import { handleListModels } from "./actions/list-models.ts";
import { handleLoadContext } from "./actions/load-context.ts";
import { handleRunSubagent } from "./actions/run-subagent.ts";

function ok(text: string): { content: Array<{ type: "text"; text: string }>; details: unknown } {
  return { content: [{ type: "text", text }], details: {} as any };
}

const contextSourceSchema = Type.Object({
  type: Type.String(),
}, { additionalProperties: true });

const modelSelectionSchema = Type.Object({
  strategy: Type.String(),
}, { additionalProperties: true });

const messageRecordSchema = Type.Object({
  id: Type.String(),
  kind: Type.String(),
  text: Type.String(),
  sequence: Type.Number(),
}, { additionalProperties: true });

const toolTraceSchema = Type.Object({
  id: Type.String(),
  messageId: Type.String(),
  toolName: Type.String(),
}, { additionalProperties: true });

const externalFileSchema = Type.Object({
  id: Type.String(),
  filePath: Type.String(),
  accessType: Type.String(),
}, { additionalProperties: true });

export function registerBlockAgentCoreTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "block_agent_core",
    label: "Block Agent Core",
    description: "Compose context blocks, run a PI SDK subagent, list models, and archive results.",
    parameters: Type.Object({
      action: Type.String(),
      sources: Type.Optional(Type.Array(contextSourceSchema)),
      separator: Type.Optional(Type.String()),
      context: Type.Optional(Type.String()),
      inputText: Type.Optional(Type.String()),
      runId: Type.Optional(Type.String()),
      keyParts: Type.Optional(Type.Array(Type.String())),
      systemPrompt: Type.Optional(Type.String()),
      cwd: Type.Optional(Type.String()),
      modelSelection: Type.Optional(modelSelectionSchema),
      tools: Type.Optional(Type.Object({
        names: Type.Optional(Type.Array(Type.String())),
      })),
      archiveEnabled: Type.Optional(Type.Boolean()),
      archiveRootDir: Type.Optional(Type.String()),
      messages: Type.Optional(Type.Array(messageRecordSchema)),
      toolCalls: Type.Optional(Type.Array(toolTraceSchema)),
      externalFiles: Type.Optional(Type.Array(externalFileSchema)),
    }) as any,
    async execute(
      _toolCallId: string,
      params: Record<string, unknown>,
      _signal: AbortSignal | undefined,
      _onUpdate: ((update: any) => void) | undefined,
      ctx: ExtensionContext,
    ) {
      const action = params.action as string;
      switch (action) {
        case "load_context":
          return handleLoadContext(params as any, ctx);
        case "run_subagent":
          return handleRunSubagent(params as any, ctx);
        case "list_models":
          return handleListModels(ctx);
        case "archive_result":
          return handleArchiveResult(params as any, ctx);
        default:
          return ok(`Unknown action: ${action}. Use load_context, run_subagent, list_models, or archive_result.`);
      }
    },
  });
}
