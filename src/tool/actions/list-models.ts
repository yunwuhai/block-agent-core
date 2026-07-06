import { listPiModels, importPiModelRegistryFromStandalone } from "../../adapter/pi-sdk.ts";
import type { StandaloneSdkOptions } from "../../session/types.ts";
import type { ExtensionContextLike, ToolResponse } from "../shared.ts";
import { error } from "../shared.ts";

export async function handleListModels(
  ctx: ExtensionContextLike,
  params?: { sdkMode?: "host-inherit" | "standalone-sdk"; sdkOptions?: StandaloneSdkOptions },
): Promise<ToolResponse> {
  try {
    const modelRegistry = params?.sdkMode === "standalone-sdk"
      ? await importPiModelRegistryFromStandalone(params.sdkOptions)
      : ctx.modelRegistry;
    const models = listPiModels(modelRegistry);
    return {
      content: [{
        type: "text",
        text: JSON.stringify(models, null, 2),
      }],
      details: models,
    };
  } catch (err) {
    return error(`Error listing models: ${(err as Error).message}`);
  }
}
