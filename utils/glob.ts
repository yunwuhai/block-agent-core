// utils/glob.ts
/**
 * Convert a glob pattern to a RegExp.
 * Supports: ** (any depth), * (single segment), ? (single char).
 * The pattern is matched against the full path.
 */
function globToRegex(pattern: string): RegExp {
  let regexStr = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i]!;
    if (ch === "*" && pattern[i + 1] === "*") {
      // ** matches anything including /
      if (pattern[i + 2] === "/") {
        regexStr += "(.*/)?";
        i += 3;
      } else {
        regexStr += ".*";
        i += 2;
      }
    } else if (ch === "*") {
      // * matches anything except /
      regexStr += "[^/]*";
      i++;
    } else if (ch === "?") {
      regexStr += "[^/]";
      i++;
    } else if (".+^${}()|[]\\".includes(ch)) {
      regexStr += "\\" + ch;
      i++;
    } else {
      regexStr += ch;
      i++;
    }
  }
  return new RegExp(`^${regexStr}$`);
}

/**
 * Match a file path against a glob pattern.
 * Returns true if the path matches.
 */
export function matchGlob(pattern: string, path: string): boolean {
  return globToRegex(pattern).test(path);
}

/**
 * Returns true if the path matches any pattern in the array.
 * Returns false if the array is empty.
 */
export function matchesAnyGlob(patterns: string[], path: string): boolean {
  return patterns.some(p => matchGlob(p, path));
}
