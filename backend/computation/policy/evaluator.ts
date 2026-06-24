import type { Action, BashRule, EvaluationResult, Policy } from "./types.ts";

export function evaluate(action: Action, policy: Policy | null): EvaluationResult {
  if (!policy) return { allowed: true, reason: "no policy configured" };
  // -- Tool whitelist check --
  if (policy.allowTools && policy.allowTools.length > 0) {
    if (!policy.allowTools.includes(action.type)) {
      return {
        allowed: false,
        reason: `tool "${action.type}" is not in allowTools`,
        rule: "allowTools",
      };
    }
  }
  // If allowTools is not specified, skip tool check (blacklist mode)

  // -- Subagent check --
  if (action.type === "subagent" && policy.allowSubagent === false) {
    return {
      allowed: false,
      reason: "subagent calls denied by policy",
      rule: "allowSubagent",
    };
  }

  // -- Path checks (denyPaths takes priority over allowPaths) --
  if (action.path) {
    // Deny paths checked first
    if (policy.denyPaths && policy.denyPaths.length > 0) {
      for (const pattern of policy.denyPaths) {
        if (matchGlob(action.path, pattern)) {
          return {
            allowed: false,
            reason: `path "${action.path}" denied by denyPaths pattern "${pattern}"`,
            rule: "denyPaths",
          };
        }
      }
    }

    // Allow paths check (if allowPaths is specified, must match)
    if (policy.allowPaths && policy.allowPaths.length > 0) {
      const matched = policy.allowPaths.some((pattern) => matchGlob(action.path!, pattern));
      if (!matched) {
        return {
          allowed: false,
          reason: `path "${action.path}" not in allowPaths`,
          rule: "allowPaths",
        };
      }
    }
    // If allowPaths not specified, path is allowed (unless denied above)
  }

  // -- Bash command checks --
  if (action.command && policy.bashRules && policy.bashRules.length > 0) {
    for (const rule of policy.bashRules) {
      const result = checkBashRule(action.command, rule);
      if (result) return result;
    }
  }

  // -- Capability checks --
  if (action.type === "capability" && action.env) {
    if (policy.denyCapabilities && policy.denyCapabilities.includes(action.env)) {
      return {
        allowed: false,
        reason: `capability "${action.env}" denied by denyCapabilities`,
        rule: "denyCapabilities",
      };
    }
    if (policy.allowCapabilities && policy.allowCapabilities.length > 0) {
      if (!policy.allowCapabilities.includes(action.env)) {
        return {
          allowed: false,
          reason: `capability "${action.env}" not in allowCapabilities`,
          rule: "allowCapabilities",
        };
      }
    }
  }

  return { allowed: true, reason: "allowed" };
}

function checkBashRule(command: string, rule: BashRule): EvaluationResult | null {
  // Deny commands checked first (deny takes priority)
  if (rule.denyCommands && rule.denyCommands.length > 0) {
    for (const deny of rule.denyCommands) {
      if (command.startsWith(deny) || command === deny) {
        return {
          allowed: false,
          reason: `bash command "${command}" denied by rule "${deny}"`,
          rule: "bashRules.denyCommands",
        };
      }
    }
  }

  if (rule.denyPatterns && rule.denyPatterns.length > 0) {
    for (const pattern of rule.denyPatterns) {
      if (matchGlob(command, pattern)) {
        return {
          allowed: false,
          reason: `bash command "${command}" denied by pattern "${pattern}"`,
          rule: "bashRules.denyPatterns",
        };
      }
    }
  }

  // Allow commands check
  if (rule.allowCommands && rule.allowCommands.length > 0) {
    const matched = rule.allowCommands.some(
      (allow) => command.startsWith(allow) || command === allow,
    );
    if (!matched) {
      // Also check allowPatterns before denying
      if (!rule.allowPatterns || !rule.allowPatterns.some((p) => matchGlob(command, p))) {
        return {
          allowed: false,
          reason: `bash command "${command}" not in allowCommands`,
          rule: "bashRules.allowCommands",
        };
      }
    }
  }

  if (rule.allowPatterns && rule.allowPatterns.length > 0) {
    const matched = rule.allowPatterns.some((p) => matchGlob(command, p));
    if (!matched && rule.allowCommands && rule.allowCommands.length === 0) {
      return {
        allowed: false,
        reason: `bash command "${command}" not in allowPatterns`,
        rule: "bashRules.allowPatterns",
      };
    }
  }

  return null;
}

/**
 * Simple glob matcher supporting * (any chars) and ? (single char).
 * Used for path patterns and command patterns.
 */
function matchGlob(value: string, pattern: string): boolean {
  if (pattern === "*") return true;

  // Convert glob to regex
  let regexStr = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i]!;
    if (ch === "*") {
      regexStr += ".*";
    } else if (ch === "?") {
      regexStr += ".";
    } else if (/[.+^${}()|[\]\\]/.test(ch)) {
      regexStr += "\\" + ch;
    } else {
      regexStr += ch;
    }
    i++;
  }

  try {
    return new RegExp(`^${regexStr}$`).test(value);
  } catch {
    return false;
  }
}
