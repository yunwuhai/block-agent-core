import type { MergedPolicy } from "./merge.ts";

export interface ActionContext {
  readonly toolName: string;
  readonly filePath?: string;
  readonly command?: string;
  readonly url?: string;
  readonly port?: number;
  readonly scheme?: string;
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

  if (policy.tools && policy.tools.length > 0 && !policy.tools.includes(context.toolName) && !policy.tools.includes("*")) {
    return { allowed: false, reason: `tool "${context.toolName}" not in allowed list (check .pi/efficiency-subagent/config.json tools field)` };
  }

  if (context.isNestedSubagent === true) {
    const allowed = policy.tools?.includes(SUBAGENT_TOOL_NAME) ?? true;
    if (!allowed) return { allowed: false, reason: "nested subagent calls blocked by policy (check config.json)" };
  }

  if (context.filePath && policy.paths && policy.paths.length > 0) {
    if (policy.excludePaths && policy.excludePaths.some((pattern) => matchPath(context.filePath!, pattern))) {
      return { allowed: false, reason: `path "${context.filePath}" is excluded by policy (check config.json)` };
    }
    const matched = policy.paths.some((pattern) => matchPath(context.filePath!, pattern));
    if (!matched) return { allowed: false, reason: `path "${context.filePath}" not allowed (check .pi/efficiency-subagent/config.json paths field)` };
  }

  if (context.command && policy.bash) {
    const { allow, deny } = policy.bash;
    if (deny && deny.some((d) => matchCommand(context.command!, d))) {
      return { allowed: false, reason: `bash "${context.command}" denied by policy (check config.json)` };
    }
    if (allow && allow.length > 0 && !allow.some((a) => matchCommand(context.command!, a))) {
      return { allowed: false, reason: `bash "${context.command}" not in allowlist (check config.json)` };
    }
  }

  if (context.url && policy.network) {
    if (!policy.network.allow) {
      if (!policy.network.allowedDomains?.some((d) => domainMatch(context.url!, d))) {
        return { allowed: false, reason: `network to ${context.url} blocked (check config.json network rules)` };
      }
    }
    if (policy.network.deniedDomains?.some((d) => domainMatch(context.url!, d))) {
      return { allowed: false, reason: `network to ${context.url} denied by policy` };
    }
    if (policy.network.allowedPorts || policy.network.deniedPorts) {
      if (!portMatch(context.url, policy.network.allowedPorts, policy.network.deniedPorts)) {
        return { allowed: false, reason: `network port not allowed for ${context.url} (check config.json)` };
      }
    }
    if (policy.network.allowedSchemes || policy.network.deniedSchemes) {
      if (!schemeMatch(context.url, policy.network.allowedSchemes, policy.network.deniedSchemes)) {
        return { allowed: false, reason: `network scheme not allowed for ${context.url} (check config.json)` };
      }
    }
  }

  if (context.envVar && policy.env) {
    if (policy.env.deny?.includes(context.envVar)) {
      return { allowed: false, reason: `env var "${context.envVar}" denied by policy (check config.json env rules)` };
    }
    if (policy.env.allow && !policy.env.allow.includes(context.envVar)) {
      return { allowed: false, reason: `env var "${context.envVar}" not in allowlist (check config.json)` };
    }
  }

  // -- Bash path extraction: check file paths embedded in bash commands --
  // e.g. "mkdir project/test2" → "project/test2" checked against paths/excludePaths
  if (context.command && policy.paths && policy.paths.length > 0) {
    const bashPaths = extractBashPaths(context.command);
    for (const bp of bashPaths) {
      // excludePaths checked first (deny wins)
      if (policy.excludePaths?.some((p) => matchPath(bp, p))) {
        return { allowed: false, reason: `bash路径 "${bp}" 被 excludePaths 策略排除` };
      }
      // paths allowlist
      if (!policy.paths.some((p) => matchPath(bp, p))) {
        return { allowed: false, reason: `bash路径 "${bp}" 不在 paths 白名单中` };
      }
    }
  }

  return { allowed: true, reason: "allowed" };
}

function matchPath(actual: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith("/**")) {
    const dir = pattern.slice(0, -3);
    // Guard against directory boundary bypass: "/foo/bar/**" must not match "/foo/bar-baz/"
    return actual === dir || (actual.startsWith(dir) && actual[dir.length] === "/");
  }
  if (pattern.endsWith("*")) {
    const prefix = pattern.slice(0, -1);
    return actual.startsWith(prefix);
  }
  return actual === pattern || actual.startsWith(pattern + "/");
}

function matchCommand(actual: string, pattern: string): boolean {
  // Glob matching: "mkdir *" → matches "mkdir -p foo", "ls *" → matches "ls -la"
  if (pattern.includes("*") || pattern.includes("?")) {
    const regexStr = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&") // escape regex specials except * and ?
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".");
    return new RegExp(`^${regexStr}$`).test(actual);
  }
  // No glob: exact command-name match or prefix match
  if (!pattern.includes(" ")) {
    const cmd = actual.split(/\s+/)[0] ?? actual;
    return cmd === pattern;
  }
  return actual.startsWith(pattern);
}

// -- Bash command path extraction --
// For commands that operate on filesystem paths (mkdir, touch, rm, mv, cp, etc.),
// extract path arguments from the command string so they can be checked against
// the path/excludePaths policy.

const PATH_OPS = new Set([
  "mkdir", "touch", "rm", "rmdir",
  "mv", "cp",
  "ls", "cat", "head", "tail", "less",
  "tee", "dd",
  "chmod", "chown",
]);

function extractBashPaths(command: string): string[] {
  const result: string[] = [];

  // 重定向目标：echo "x" > path, 2> path 等
  const redirectRe = /[12]?>>?\s*(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = redirectRe.exec(command)) !== null) {
    result.push(m[1]!);
  }

  // 命令名
  const firstToken = command.trim().split(/\s+/)[0] ?? "";
  if (!PATH_OPS.has(firstToken)) return result;

  // 提取路径参数
  const isPathOp = PATH_OPS.has(firstToken);
  const parts = command.split(/\s+/).slice(1);
  for (const p of parts) {
    if (p.startsWith("-")) continue;
    const cleaned = p.replace(/^['"]|['"]$/g, "");
    // 绝对/相对路径，或 PATH_OPS 命令的裸文件名
    if (cleaned.startsWith("/") || cleaned.startsWith("./") ||
        cleaned.startsWith("../") || cleaned.includes("/") ||
        isPathOp) {
      result.push(cleaned);
    }
  }

  return [...new Set(result)];
}

function domainMatch(url: string, pattern: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    if (pattern.startsWith("*.")) {
      const suffix = pattern.slice(2);
      return hostname === suffix || hostname.endsWith("." + suffix);
    }
    return hostname === pattern;
  } catch {
    return false;
  }
}

function portMatch(url: string, allowedPorts?: readonly number[], deniedPorts?: readonly number[]): boolean {
  try {
    const port = new URL(url).port || (url.startsWith("https://") ? "443" : "80");
    const portNum = Number(port);
    if (deniedPorts?.includes(portNum)) return false;
    if (allowedPorts && allowedPorts.length > 0 && !allowedPorts.includes(portNum)) return false;
    return true;
  } catch { return true; }
}

function schemeMatch(url: string, allowedSchemes?: readonly string[], deniedSchemes?: readonly string[]): boolean {
  try {
    const scheme = new URL(url).protocol.replace(":", "");
    if (deniedSchemes?.includes(scheme)) return false;
    if (allowedSchemes && allowedSchemes.length > 0 && !allowedSchemes.includes(scheme)) return false;
    return true;
  } catch { return true; }
}
