export const PI_BUILTIN_TOOLS = [
  "read",
  "bash",
  "edit",
  "write",
  "grep",
  "find",
  "ls",
] as const;

export const PI_DEFAULT_SUBAGENT_TOOLS = [
  "read",
  "bash",
  "edit",
  "write",
] as const;

export type PiBuiltinTool = typeof PI_BUILTIN_TOOLS[number];

export interface SubagentTurnIdentity {
  runId: string;
  keyParts: string[];
  prefix?: string;
  separator?: string;
}

export interface SubagentModelCurrentSelection {
  strategy: "current";
}

export interface SubagentModelDefaultSelection {
  strategy: "default";
}

export interface SubagentModelSpecificSelection {
  strategy: "specific";
  provider: string;
  modelId: string;
}

export type SubagentModelSelection =
  | SubagentModelCurrentSelection
  | SubagentModelDefaultSelection
  | SubagentModelSpecificSelection;

export interface SubagentToolSelection {
  names?: string[];
}

export interface SubagentRunRequest {
  inputText: string;
  context?: string;
  systemPrompt?: string;
  cwd?: string;
  modelSelection?: SubagentModelSelection;
  tools?: SubagentToolSelection;
}

export function composeSubagentTurnId(identity: SubagentTurnIdentity): string {
  const separator = identity.separator ?? ":";
  const parts = [
    identity.prefix,
    identity.runId,
    ...identity.keyParts,
  ].filter((part): part is string => Boolean(part && part.length > 0));
  return parts.join(separator);
}

export function normalizeToolNames(selection?: SubagentToolSelection): string[] {
  const names = selection?.names?.length
    ? selection.names
    : [...PI_DEFAULT_SUBAGENT_TOOLS];
  return [...new Set(names)];
}

export function usesOnlyBuiltinTools(toolNames: string[]): boolean {
  const builtin = new Set<string>(PI_BUILTIN_TOOLS);
  return toolNames.every(toolName => builtin.has(toolName));
}
