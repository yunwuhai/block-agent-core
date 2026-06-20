import type { MergedPolicy } from "./merge.ts";

export interface ActionContext {
  readonly toolName: string;
  readonly filePath?: string;
  readonly command?: string;
  readonly url?: string;
  readonly envVar?: string;
  readonly isNestedSubagent?: boolean;
}

export interface PolicyDecision {
  readonly allowed: boolean;
  readonly reason: string;
}

const SUBAGENT_TOOL_NAME = "efficiency_subagent";

export function evaluate(context: ActionContext, policy: MergedPolicy | null): PolicyDecision {
  if (!policy) return { allowed: true, reason: "no policy configured" };

  if (policy.tools && !policy.tools.includes(context.toolName) && !policy.tools.includes("*")) {
    return { allowed: false, reason: `tool ${context.toolName} not in allowed list` };
  }

  if (context.isNestedSubagent === true) {
    const allowed = policy.tools?.includes(SUBAGENT_TOOL_NAME) ?? true;
    if (!allowed) return { allowed: false, reason: "nested subagent calls blocked" };
  }

  if (context.filePath && policy.paths && policy.paths.length > 0) {
    const matched = policy.paths.some((pattern) => matchPath(context.filePath!, pattern));
    if (!matched) return { allowed: false, reason: `path ${context.filePath} not allowed` };
  }

  if (context.command && policy.bash) {
    const { allow, deny } = policy.bash;
    if (deny && deny.some((d) => matchCommand(context.command!, d))) {
      return { allowed: false, reason: `bash command ${context.command} denied` };
    }
    if (allow && allow.length > 0 && !allow.some((a) => matchCommand(context.command!, a))) {
      return { allowed: false, reason: `bash command ${context.command} not in allowlist` };
    }
  }

  if (context.url && policy.network) {
    if (!policy.network.allow) {
      if (!policy.network.allowedDomains?.some((d) => domainMatch(context.url!, d))) {
        return { allowed: false, reason: `network access to ${context.url} not allowed` };
      }
    }
    if (policy.network.deniedDomains?.some((d) => domainMatch(context.url!, d))) {
      return { allowed: false, reason: `network access to ${context.url} denied` };
    }
  }

  if (context.envVar && policy.env) {
    if (policy.env.deny?.includes(context.envVar)) {
      return { allowed: false, reason: `env var ${context.envVar} denied` };
    }
    if (policy.env.allow && !policy.env.allow.includes(context.envVar)) {
      return { allowed: false, reason: `env var ${context.envVar} not in allowlist` };
    }
  }

  return { allowed: true, reason: "allowed" };
}

function matchPath(actual: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith("/**")) {
    const dir = pattern.slice(0, -3);
    return actual.startsWith(dir);
  }
  if (pattern.endsWith("*")) {
    const prefix = pattern.slice(0, -1);
    return actual.startsWith(prefix);
  }
  return actual === pattern || actual.startsWith(pattern + "/");
}

function matchCommand(actual: string, pattern: string): boolean {
  const cmd = actual.split(/\s+/)[0] ?? actual;
  return cmd === pattern;
}

function domainMatch(url: string, pattern: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    if (pattern.startsWith("*.")) {
      const suffix = pattern.slice(2);
      return hostname.endsWith(suffix);
    }
    return hostname === pattern;
  } catch {
    return false;
  }
}
