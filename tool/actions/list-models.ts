import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { listPiModels } from "../../adapter/pi-sdk.ts";

export async function handleListModels(
  ctx: ExtensionContext,
): Promise<{ content: Array<{ type: "text"; text: string }>; details: unknown }> {
  const models = listPiModels(ctx.modelRegistry);
  return {
    content: [{
      type: "text",
      text: JSON.stringify(models, null, 2),
    }],
    details: models,
  };
}
