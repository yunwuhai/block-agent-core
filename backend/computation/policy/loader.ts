import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { BashRule, NetworkRule, Policy } from "./types.ts";

/**
 * Load project-level policy from .pi/better-subagent/config.json.
 * Returns null if the file does not exist (fail-open).
 */
export function loadProjectPolicy(cwd: string): Policy | null {
  const configPath = join(cwd, ".pi", "better-subagent", "config.json");
  if (!existsSync(configPath)) return null;

  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    return normalizePolicy(parsed);
  } catch {
    return null;
  }
}

/**
 * Load a profile policy from .profiles/<name>.md frontmatter,
 * then merge it with the project policy. Always returns a Policy.
 */
export function loadProfilePolicy(cwd: string, profileName: string): Policy {
  const profilePath = join(cwd, ".profiles", `${profileName}.md`);

  const projectPolicy = loadProjectPolicy(cwd) ?? {};
  const profilePolicy = existsSync(profilePath)
    ? parseFrontmatterPolicy(readFileSync(profilePath, "utf-8"))
    : {};

  return mergePolicies(projectPolicy, profilePolicy);
}

// -- Internal helpers --

function normalizePolicy(raw: Record<string, unknown>): Policy {
  return {
    ...(raw.allowTools !== undefined ? { allowTools: ensureStringArray(raw.allowTools) } : {}),
    ...(raw.allowPaths !== undefined ? { allowPaths: ensureStringArray(raw.allowPaths) } : {}),
    ...(raw.denyPaths !== undefined ? { denyPaths: ensureStringArray(raw.denyPaths) } : {}),
    ...(raw.allowSubagent !== undefined ? { allowSubagent: Boolean(raw.allowSubagent) } : {}),
    ...(raw.allowCapabilities !== undefined
      ? { allowCapabilities: ensureStringArray(raw.allowCapabilities) }
      : {}),
    ...(raw.denyCapabilities !== undefined
      ? { denyCapabilities: ensureStringArray(raw.denyCapabilities) }
      : {}),
    ...(raw.bashRules !== undefined
      ? { bashRules: normalizeBashRules(raw.bashRules) }
      : {}),
    ...(raw.networkRules !== undefined
      ? { networkRules: normalizeNetworkRules(raw.networkRules) }
      : {}),
  };
}

function normalizeBashRules(raw: unknown): BashRule[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r: unknown) => {
    const rule = r as Record<string, unknown>;
    return {
      ...(rule.allowCommands !== undefined
        ? { allowCommands: ensureStringArray(rule.allowCommands) }
        : {}),
      ...(rule.denyCommands !== undefined
        ? { denyCommands: ensureStringArray(rule.denyCommands) }
        : {}),
      ...(rule.allowPatterns !== undefined
        ? { allowPatterns: ensureStringArray(rule.allowPatterns) }
        : {}),
      ...(rule.denyPatterns !== undefined
        ? { denyPatterns: ensureStringArray(rule.denyPatterns) }
        : {}),
    };
  });
}

function normalizeNetworkRules(raw: unknown): NetworkRule[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r: unknown) => {
    const rule = r as Record<string, unknown>;
    return {
      ...(rule.allowDomains !== undefined
        ? { allowDomains: ensureStringArray(rule.allowDomains) }
        : {}),
      ...(rule.denyDomains !== undefined
        ? { denyDomains: ensureStringArray(rule.denyDomains) }
        : {}),
      ...(rule.allowPorts !== undefined
        ? { allowPorts: ensureNumberArray(rule.allowPorts) }
        : {}),
      ...(rule.allowSchemes !== undefined
        ? { allowSchemes: ensureStringArray(rule.allowSchemes) }
        : {}),
    };
  });
}

/**
 * Parse YAML frontmatter from a .md file and extract policy fields.
 * Simple line-by-line parser — no YAML library dependency.
 */
function parseFrontmatterPolicy(content: string): Partial<Policy> {
  const lines = content.split("\n");
  if (lines.length < 3 || lines[0]!.trim() !== "---") return {};

  const endIndex = lines.indexOf("---", 1);
  if (endIndex === -1) return {};

  const frontmatter = lines.slice(1, endIndex).join("\n");
  return parseYamlPolicyFields(frontmatter);
}

function parseYamlPolicyFields(yaml: string): Partial<Policy> {
  const policy: Record<string, unknown> = {};
  const lines = yaml.split("\n");

  let currentKey: string | null = null;
  let currentArray: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) continue;

    // List item under a key
    if (trimmed.startsWith("- ")) {
      const value = trimmed.slice(2).trim();
      if (currentKey) {
        currentArray.push(value);
      }
      continue;
    }

    // Flush any accumulated array
    if (currentKey && currentArray.length > 0) {
      policy[currentKey] = [...currentArray];
      currentArray = [];
      currentKey = null;
    }

    // Key-value pair
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx > 0) {
      const key = trimmed.slice(0, colonIdx).trim();
      const value = trimmed.slice(colonIdx + 1).trim();

      if (value === "") {
        // Could be a list key; wait for items
        currentKey = key;
        currentArray = [];
      } else {
        policy[key] = parseYamlScalar(value);
      }
    }
  }

  // Flush final array
  if (currentKey && currentArray.length > 0) {
    policy[currentKey] = [...currentArray];
  }

  return normalizePolicy(policy);
}

function parseYamlScalar(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~") return null;
  const num = Number(value);
  if (!Number.isNaN(num) && value.trim() !== "") return num;
  const str = value.replace(/^["']|["']$/g, "");
  return str;
}

function ensureStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return [value];
  return [];
}

function ensureNumberArray(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number).filter((n) => !Number.isNaN(n));
  if (typeof value === "number") return [value];
  return [];
}

/**
 * Deep-merge two policies. Profile values override project values
 * for top-level scalar fields. Arrays are merged (union).
 */
function mergePolicies(base: Policy, override: Partial<Policy>): Policy {
  const result: Record<string, unknown> = {};

  const allowTools = mergeArrays(base.allowTools, override.allowTools);
  if (allowTools !== undefined) result.allowTools = allowTools;

  const allowPaths = mergeArrays(base.allowPaths, override.allowPaths);
  if (allowPaths !== undefined) result.allowPaths = allowPaths;

  const denyPaths = mergeArrays(base.denyPaths, override.denyPaths);
  if (denyPaths !== undefined) result.denyPaths = denyPaths;

  const allowCapabilities = mergeArrays(base.allowCapabilities, override.allowCapabilities);
  if (allowCapabilities !== undefined) result.allowCapabilities = allowCapabilities;

  const denyCapabilities = mergeArrays(base.denyCapabilities, override.denyCapabilities);
  if (denyCapabilities !== undefined) result.denyCapabilities = denyCapabilities;

  if (override.allowSubagent !== undefined) result.allowSubagent = override.allowSubagent;
  else if (base.allowSubagent !== undefined) result.allowSubagent = base.allowSubagent;

  const bashRules = mergeBashRules(base.bashRules, override.bashRules);
  if (bashRules !== undefined) result.bashRules = bashRules;

  const networkRules = mergeNetworkRules(base.networkRules, override.networkRules);
  if (networkRules !== undefined) result.networkRules = networkRules;

  return result as Policy;
}

function mergeArrays(a?: string[], b?: string[]): string[] | undefined {
  if (!a && !b) return undefined;
  const merged = [...new Set([...(a ?? []), ...(b ?? [])])];
  return merged.length > 0 ? merged : undefined;
}

function mergeBashRules(a?: BashRule[], b?: BashRule[]): BashRule[] | undefined {
  if (!a && !b) return undefined;
  return [...(a ?? []), ...(b ?? [])];
}

function mergeNetworkRules(a?: NetworkRule[], b?: NetworkRule[]): NetworkRule[] | undefined {
  if (!a && !b) return undefined;
  return [...(a ?? []), ...(b ?? [])];
}
