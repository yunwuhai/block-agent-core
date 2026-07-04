import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  runSubagentWithPiSdk,
  type PiSdkRunOptions,
  type PiSdkRunResult,
} from "../../adapter/pi-sdk.ts";
import { composeContext, type ContextSource } from "../../core/context-sources.ts";
import { createDefaultArchiveRootDir } from "../../core/archive-store.ts";
import type { SubagentModelSelection, SubagentToolSelection } from "../../core/subagent-run.ts";

export interface RunSubagentParams {
  inputText: string;
  runId: string;
  keyParts: string[];
  context?: string;
  sources?: ContextSource[];
  separator?: string;
  systemPrompt?: string;
  cwd?: string;
  modelSelection?: SubagentModelSelection;
  tools?: SubagentToolSelection;
  archiveEnabled?: boolean;
  archiveRootDir?: string;
}

export interface RunSubagentDeps {
  runWithSdk: (options: PiSdkRunOptions) => Promise<PiSdkRunResult>;
  composeContextText: (sources: ContextSource[], separator: string) => Promise<string>;
  defaultArchiveRootDir: (cwd: string, runId: string) => string;
}

const defaultDeps: RunSubagentDeps = {
  runWithSdk: runSubagentWithPiSdk,
  composeContextText: (sources, separator) => composeContext(sources, undefined, separator),
  defaultArchiveRootDir: createDefaultArchiveRootDir,
};

export async function handleRunSubagent(
  params: RunSubagentParams,
  ctx: ExtensionContext,
  deps: RunSubagentDeps = defaultDeps,
): Promise<{ content: Array<{ type: "text"; text: string }>; details: unknown }> {
  try {
    const sourceContext = params.sources?.length
      ? await deps.composeContextText(params.sources, params.separator ?? "\n\n")
      : "";
    const context = [params.context, sourceContext]
      .filter((part): part is string => Boolean(part && part.length > 0))
      .join("\n\n");
    const cwd = params.cwd ?? ctx.cwd;
    const archiveRootDir = params.archiveEnabled === false
      ? undefined
      : (params.archiveRootDir ?? deps.defaultArchiveRootDir(cwd, params.runId));

    const result = await deps.runWithSdk({
      inputText: params.inputText,
      turnIdentity: {
        runId: params.runId,
        keyParts: params.keyParts,
      },
      context,
      cwd,
      modelRegistry: ctx.modelRegistry,
      ...(params.systemPrompt ? { systemPrompt: params.systemPrompt } : {}),
      ...(params.modelSelection ? { modelSelection: params.modelSelection } : {}),
      ...(params.tools ? { tools: params.tools } : {}),
      ...(archiveRootDir ? { archiveRootDir } : {}),
      ...(ctx.model ? { currentModel: ctx.model } : {}),
    });

    return {
      content: [{ type: "text", text: result.replyText }],
      details: result,
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error running subagent: ${(err as Error).message}` }],
      details: {} as any,
    };
  }
}
