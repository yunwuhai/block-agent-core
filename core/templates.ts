import { createCrudModule } from "./crud-factory.ts";
import type { TemplateInput, TemplateRecord, TemplateFilter } from "./types.ts";

// ---------------------------------------------------------------------------
// CRUD factory — replaces the previous inline append/get/query/update
// ---------------------------------------------------------------------------
const crud = createCrudModule<TemplateRecord, TemplateInput, TemplateFilter>(
  "template",
  (id, input, extra) => ({
    id,
    path: extra as string,
    tags: input.tags ?? [],
  }),
  (record, filter) =>
    !filter.tags?.length || record.tags.some(t => filter.tags!.includes(t)),
);

export async function appendTemplate(
  tablePath: string,
  id: string,
  templateMdPath: string,
  tmpl: TemplateInput,
): Promise<TemplateRecord> {
  return crud.append(tablePath, id, tmpl, templateMdPath);
}

export async function getTemplate(
  tablePath: string,
  id: string,
): Promise<TemplateRecord | null> {
  return crud.get(tablePath, id);
}

export async function queryTemplates(
  tablePath: string,
  filter: TemplateFilter,
): Promise<TemplateRecord[]> {
  return crud.query(tablePath, filter);
}

export async function updateTemplate(
  tablePath: string,
  id: string,
  patch: Partial<TemplateRecord>,
): Promise<boolean> {
  return crud.update(tablePath, id, patch);
}
