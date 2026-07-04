import { readFile } from "node:fs/promises";
import { readJsonl } from "../utils/jsonl.ts";

export interface JsonlFieldsSource {
  type: "jsonl-fields";
  filePath: string;
  fieldOrder: string[];
  recordIds?: string[];
  idKey?: string;
  recordSeparator?: string;
  valueSeparator?: string;
}

export interface FileSliceSource {
  type: "file";
  filePath: string;
  lines?: string;
}

export interface CustomContextSource {
  type: string;
  [key: string]: unknown;
}

export type ContextSource = JsonlFieldsSource | FileSliceSource | CustomContextSource;

export type ContextSourceLoader<TSource extends ContextSource = ContextSource> =
  (source: TSource) => Promise<string>;

export type ContextLoaderRegistry = Record<string, ContextSourceLoader>;

function getNestedValue(record: unknown, keyPath: string): unknown {
  if (!keyPath) return undefined;
  const parts = keyPath.split(".");
  let current: unknown = record;
  for (const part of parts) {
    if (!current || typeof current !== "object" || !(part in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function applyLineRange(content: string, range?: string): string {
  if (!range) return content;
  const [startStr, endStr] = range.split("-");
  const start = Number.parseInt(startStr ?? "", 10);
  const end = endStr ? Number.parseInt(endStr, 10) : undefined;
  if (Number.isNaN(start)) return content;
  return content.split("\n").slice(start - 1, end).join("\n");
}

export async function loadJsonlFieldsSource(source: JsonlFieldsSource): Promise<string> {
  const records = await readJsonl<Record<string, unknown>>(source.filePath);
  const idKey = source.idKey ?? "id";
  const filtered = source.recordIds?.length
    ? records.filter(record => source.recordIds!.includes(String(getNestedValue(record, idKey) ?? "")))
    : records;

  const valueSeparator = source.valueSeparator ?? "\n";
  const recordSeparator = source.recordSeparator ?? "\n\n";

  return filtered
    .map(record =>
      source.fieldOrder
        .map(field => formatValue(getNestedValue(record, field)))
        .filter(value => value.length > 0)
        .join(valueSeparator))
    .filter(block => block.length > 0)
    .join(recordSeparator);
}

export async function loadFileSliceSource(source: FileSliceSource): Promise<string> {
  const content = await readFile(source.filePath, "utf-8");
  return applyLineRange(content, source.lines);
}

export function createContextLoaderRegistry(
  customLoaders: ContextLoaderRegistry = {},
): ContextLoaderRegistry {
  return {
    "jsonl-fields": loadJsonlFieldsSource as ContextSourceLoader,
    file: loadFileSliceSource as ContextSourceLoader,
    ...customLoaders,
  };
}

const defaultRegistry = createContextLoaderRegistry();

export async function loadContextSource(
  source: ContextSource,
  registry: ContextLoaderRegistry = defaultRegistry,
): Promise<string> {
  const loader = registry[source.type];
  if (!loader) {
    throw new Error(`No context loader registered for source type "${source.type}"`);
  }
  return loader(source);
}

export async function loadContextSources(
  sources: ContextSource[],
  registry: ContextLoaderRegistry = defaultRegistry,
): Promise<string[]> {
  const parts: string[] = [];
  for (const source of sources) {
    parts.push(await loadContextSource(source, registry));
  }
  return parts;
}

export async function composeContext(
  sources: ContextSource[],
  registry: ContextLoaderRegistry = defaultRegistry,
  separator: string = "\n\n",
): Promise<string> {
  const parts = await loadContextSources(sources, registry);
  return parts.filter(part => part.length > 0).join(separator);
}
