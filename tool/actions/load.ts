// tool/actions/load.ts
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { buildPrompt } from "../../core/build-prompt.ts";
import { readJsonl } from "../../utils/jsonl.ts";
import { readFile } from "node:fs/promises";
import type { CallRecord, Ref } from "../../core/types.ts";
interface LoadParams {
  recipePath: string;
  recipeId?: string;
  callRecordPath: string;
}

export async function defaultResolver(ref: Ref): Promise<string> {
  if (ref.mode === "handoff") {
    const records = await readJsonl<{ id: string; handoff: string }>(ref.file);
    const record = records.find(r => r.id === ref.id);
    return record?.handoff ?? `[handoff not found: ${ref.id}]`;
  }
  try {
    const records = await readJsonl<{ id: string; path: string }>(ref.file);
    const record = records.find(r => r.id === ref.id);
    if (!record) return `[content not found: ${ref.id} in ${ref.file}]`;
    let content = await readFile(record.path, "utf-8");
    if (ref.lines) {
      const [startStr, endStr] = ref.lines.split("-");
      const startLine = parseInt(startStr!, 10);
      const endLine = endStr ? parseInt(endStr, 10) : undefined;
      const lines = content.split("\n");
      content = lines.slice(startLine - 1, endLine).join("\n");
    }
    return content;
  } catch {
    return `[error reading: ${ref.id}]`;
  }
}

export async function handleLoad(
  params: LoadParams,
  _ctx: ExtensionContext,
): Promise<{ content: Array<{ type: "text"; text: string }>; details: unknown }> {
  const records = await readJsonl<CallRecord>(params.callRecordPath);
  const callRecord = params.recipeId
    ? records.find(r => r.recipeId === params.recipeId)
    : records[records.length - 1];

  if (!callRecord) {
    return { content: [{ type: "text", text: `Error: No call record found in ${params.callRecordPath}` }], details: {} as any };
  }

  const refContents = new Map<string, string>();
  for (const zoneRefs of Object.values(callRecord.zones)) {
    for (const ref of zoneRefs) {
      const key = `${ref.file}:${ref.id}:${ref.mode ?? "full"}:${ref.lines ?? ""}`;
      if (!refContents.has(key)) {
        refContents.set(key, await defaultResolver(ref));
      }
    }
  }

  const resolver = (ref: Ref): string =>
    refContents.get(`${ref.file}:${ref.id}:${ref.mode ?? "full"}:${ref.lines ?? ""}`)
    ?? `[unresolved: ${ref.id}]`;

  const prompt = await buildPrompt(params.recipePath, callRecord, resolver);
  return { content: [{ type: "text", text: prompt }], details: {} as any };
}
