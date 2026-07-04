import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  createArchiveLayout,
  createDefaultArchiveRootDir,
  saveSubagentResult,
  type ExternalFileAccessRecord,
  type MessageRecord,
  type ToolCallTrace,
} from "../../core/archive-store.ts";

interface ArchiveResultParams {
  runId?: string;
  cwd?: string;
  archiveRootDir?: string;
  messages?: MessageRecord[];
  toolCalls?: ToolCallTrace[];
  externalFiles?: ExternalFileAccessRecord[];
}

export async function handleArchiveResult(
  params: ArchiveResultParams,
  ctx: ExtensionContext,
): Promise<{ content: Array<{ type: "text"; text: string }>; details: unknown }> {
  try {
    const archiveRootDir = params.archiveRootDir
      ?? (params.runId ? createDefaultArchiveRootDir(params.cwd ?? ctx.cwd, params.runId) : undefined);
    if (!archiveRootDir) {
      throw new Error("archiveRootDir or runId is required for archive_result");
    }

    const layout = createArchiveLayout(archiveRootDir);
    const result = await saveSubagentResult(layout, {
      ...(params.messages ? { messages: params.messages } : {}),
      ...(params.toolCalls ? { toolCalls: params.toolCalls } : {}),
      ...(params.externalFiles ? { externalFiles: params.externalFiles } : {}),
    });
    return {
      content: [{
        type: "text",
        text: `Archived result to ${archiveRootDir}`,
      }],
      details: { archiveRootDir, toolCallPaths: result.toolCallPaths },
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error archiving result: ${(err as Error).message}` }],
      details: {} as any,
    };
  }
}
