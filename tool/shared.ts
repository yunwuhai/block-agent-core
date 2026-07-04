import type { ModelRegistry, PiModel } from "../adapter/pi-sdk.ts";

export interface ExtensionContextLike {
  cwd: string;
  modelRegistry: ModelRegistry;
  model?: PiModel;
}

export interface ToolResponse {
  content: Array<{ type: "text"; text: string }>;
  details: unknown;
}

export function ok(text: string, details: unknown = {}): ToolResponse {
  return {
    content: [{ type: "text", text }],
    details,
  };
}

export function error(text: string, details: unknown = {}): ToolResponse {
  return {
    content: [{ type: "text", text }],
    details,
  };
}
