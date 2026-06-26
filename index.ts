// index.ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerDialogueMemoryTool } from "./tool/dialogue-memory.ts";

// Default export: PI extension
export default function (pi: ExtensionAPI): void {
  registerDialogueMemoryTool(pi);
}

// Named exports: core API (zero PI dependency)
export { appendTurn, getTurn, queryTurns, updateTurn } from "./core/turns.ts";
export { appendToolCall, getToolCall, queryToolCalls, updateToolCall } from "./core/tool-calls.ts";
export { appendTemplate, getTemplate, queryTemplates, updateTemplate } from "./core/templates.ts";
export { appendFileRef, getFileRef, queryFileRefs, updateFileRef } from "./core/file-refs.ts";
export { appendCallRecord, getCallRecord, queryCallRecords, updateCallRecord } from "./core/call-records.ts";
export { loadRecipes, getRecipe, addRecipe, updateRecipe } from "./core/recipes.ts";
export { buildPrompt, buildPromptFromRecipe } from "./core/build-prompt.ts";
export { saveTurn } from "./core/save-turn.ts";
export type * from "./core/types.ts";
