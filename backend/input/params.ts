import { ToolParamsSchema } from "./schema.ts";
import type { ToolParams } from "./schema.ts";

export function validateToolParams(raw: unknown): ToolParams {
  return ToolParamsSchema.parse(raw);
}
