// core/templates.ts
import { readJsonl, appendJsonl, updateJsonl } from "../utils/jsonl.ts";
import type { TemplateInput, TemplateRecord, TemplateFilter } from "./types.ts";

export async function appendTemplate(
  tablePath: string,
  id: string,
  templateMdPath: string,
  tmpl: TemplateInput,
): Promise<TemplateRecord> {
  const record: TemplateRecord = {
    id,
    path: templateMdPath,
    tags: tmpl.tags ?? [],
  };
  await appendJsonl(tablePath, record);
  return record;
}

export async function getTemplate(
  tablePath: string,
  id: string,
): Promise<TemplateRecord | null> {
  const records = await readJsonl<TemplateRecord>(tablePath);
  return records.find(r => r.id === id) ?? null;
}

export async function queryTemplates(
  tablePath: string,
  filter: TemplateFilter,
): Promise<TemplateRecord[]> {
  let records = await readJsonl<TemplateRecord>(tablePath);
  if (filter.ids && filter.ids.length > 0) {
    const idSet = new Set(filter.ids);
    records = records.filter(r => idSet.has(r.id));
  }
  if (filter.tags && filter.tags.length > 0) {
    records = records.filter(r =>
      r.tags.some(t => filter.tags!.includes(t)),
    );
  }
  return records;
}

export async function updateTemplate(
  tablePath: string,
  id: string,
  patch: Partial<TemplateRecord>,
): Promise<boolean> {
  return updateJsonl<TemplateRecord>(tablePath, id, patch);
}
