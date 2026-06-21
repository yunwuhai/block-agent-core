import type { ProjectPolicy } from "../../input/mod.ts";
import type { PolicyEntry } from "./merge.ts";

export function toPolicyEntry(raw: ProjectPolicy): PolicyEntry {
  return {
    ...(raw.tools !== undefined ? { tools: raw.tools } : {}),
    ...(raw.paths !== undefined ? { paths: raw.paths } : {}),
    ...(raw.excludePaths !== undefined ? { excludePaths: raw.excludePaths } : {}),
    ...(raw.bash !== undefined
      ? {
          bash: {
            ...(raw.bash.allow !== undefined ? { allow: raw.bash.allow } : {}),
            ...(raw.bash.deny !== undefined ? { deny: raw.bash.deny } : {}),
          },
        }
      : {}),
    ...(raw.network !== undefined
      ? {
          network: {
            allow: raw.network.allow ?? false,
            ...(raw.network.allowedDomains !== undefined
              ? { allowedDomains: raw.network.allowedDomains }
              : {}),
            ...(raw.network.deniedDomains !== undefined
              ? { deniedDomains: raw.network.deniedDomains }
              : {}),
          },
        }
      : {}),
    ...(raw.env !== undefined
      ? {
          env: {
            ...(raw.env.allow !== undefined ? { allow: raw.env.allow } : {}),
            ...(raw.env.deny !== undefined ? { deny: raw.env.deny } : {}),
          },
        }
      : {}),
  };
}
