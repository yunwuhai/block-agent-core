// tool/actions/load.ts
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { buildPrompt } from "../../core/build-prompt.ts";
import { readJsonl } from "../../utils/jsonl.ts";
import { readFile } from "node:fs/promises";
import type { CallRecord, Ref } from "../../core/types.ts";
import { setPermissions, clearPermissions } from "../permissions.ts";

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
  ctx: ExtensionContext,
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

  // Collect template refs and merge permissions
  const templateRefs: Ref[] = [];
  for (const zoneRefs of Object.values(callRecord.zones)) {
    for (const ref of zoneRefs) {
      if (ref.file.includes("template")) templateRefs.push(ref);
    }
  }
  if (templateRefs.length > 0) {
    const allowedReads = new Set<string>();
    const allowedWrites = new Set<string>();
    const denied = new Set<string>();
    let allowBash = false;
    for (const tr of templateRefs) {
      const records = await readJsonl<Record<string, any>>(tr.file);
      const tmpl = records.find((r: any) => r.id === tr.id);
      if (tmpl) {
        (tmpl.allowReadPaths || []).forEach((p: string) => allowedReads.add(p));
        (tmpl.allowWritePaths || []).forEach((p: string) => allowedWrites.add(p));
        (tmpl.denyPaths || []).forEach((p: string) => denied.add(p));
        if (tmpl.allowBash) allowBash = true;
      }
    }
    // Store permissions for tool_call interceptor (regardless of UI)
    setPermissions(
      Array.from(allowedReads),
      Array.from(allowedWrites),
      Array.from(denied),
    );
    if (ctx.hasUI && (allowedReads.size > 0 || allowedWrites.size > 0 || allowBash)) {
      const lines = [
        ...Array.from(allowedReads).map(p => `  read: ${p}`),
        ...Array.from(allowedWrites).map(p => `  write: ${p}`),
        ...Array.from(denied).map(p => `  deny: ${p}`),
        allowBash ? "  bash: yes" : "",
      ].filter(Boolean);
      if (lines.length > 0) {
        const ok = await ctx.ui.confirm("Template Permissions", `Loaded templates grant:\n${lines.join("\n")}\n\nProceed?`);
        if (!ok) {
          clearPermissions();
          return { content: [{ type: "text", text: "Operation cancelled by user." }], details: {} as any };
        }
      }
    }
  } else {
    clearPermissions();
  }

  const resolver = (ref: Ref): string =>
    refContents.get(`${ref.file}:${ref.id}:${ref.mode ?? "full"}:${ref.lines ?? ""}`)
    ?? `[unresolved: ${ref.id}]`;

  const prompt = await buildPrompt(params.recipePath, callRecord, resolver);
  return { content: [{ type: "text", text: prompt }], details: {} as any };
}
