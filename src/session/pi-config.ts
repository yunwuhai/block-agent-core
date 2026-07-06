export interface SubagentExecutionConfig {
  cwd?: string;
  model?: string;
  outputMode?: "text" | "json";
  maxTurns?: number;
  metadata?: Record<string, unknown>;
}

export interface BuildSubagentInvocationInput {
  task: string;
  context: string;
  systemPrompt?: string;
  execution?: SubagentExecutionConfig;
}

export interface SubagentInvocation {
  prompt: string;
  execution: SubagentExecutionConfig;
}

export function buildSubagentPrompt(input: BuildSubagentInvocationInput): string {
  const sections: string[] = [];

  if (input.systemPrompt && input.systemPrompt.trim().length > 0) {
    sections.push(input.systemPrompt.trim());
  }

  if (input.context.trim().length > 0) {
    sections.push(`Context:\n${input.context.trim()}`);
  }

  sections.push(`Task:\n${input.task.trim()}`);
  return sections.join("\n\n");
}

export function buildSubagentInvocation(
  input: BuildSubagentInvocationInput,
): SubagentInvocation {
  return {
    prompt: buildSubagentPrompt(input),
    execution: input.execution ?? {},
  };
}
