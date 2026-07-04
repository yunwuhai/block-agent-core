import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { composeContext, type ContextSource } from "../../core/context-sources.ts";

interface LoadContextParams {
  sources: ContextSource[];
  separator?: string;
}

export async function handleLoadContext(
  params: LoadContextParams,
  _ctx: ExtensionContext,
): Promise<{ content: Array<{ type: "text"; text: string }>; details: unknown }> {
  try {
    const text = await composeContext(params.sources ?? [], undefined, params.separator ?? "\n\n");
    return {
      content: [{ type: "text", text }],
      details: { sourceCount: params.sources?.length ?? 0 },
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error loading context: ${(err as Error).message}` }],
      details: {} as any,
    };
  }
}
