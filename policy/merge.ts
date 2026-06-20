export interface PathRule {
  readonly tools: readonly string[];
  readonly paths: readonly string[];
}

export interface BashRule {
  readonly allow?: readonly string[];
  readonly deny?: readonly string[];
}

export interface NetworkRule {
  readonly allow: boolean;
  readonly allowedDomains?: readonly string[];
  readonly deniedDomains?: readonly string[];
}

export interface EnvRule {
  readonly allow?: readonly string[];
  readonly deny?: readonly string[];
}

export interface PolicyEntry {
  readonly tools?: readonly string[];
  readonly paths?: readonly string[];
  readonly bash?: BashRule;
  readonly network?: NetworkRule;
  readonly env?: EnvRule;
  readonly locked?: boolean;
}

export interface MergedPolicy {
  readonly tools: readonly string[] | null;
  readonly paths: readonly string[] | null;
  readonly bash: BashRule | null;
  readonly network: NetworkRule | null;
  readonly env: EnvRule | null;
}

export function mergePolicies(...policies: readonly (PolicyEntry | undefined | null)[]): MergedPolicy {
  let tools: string[] | null = null;
  let paths: string[] | null = null;
  let bash: BashRule | null = null;
  let network: NetworkRule | null = null;
  let env: EnvRule | null = null;

  for (const entry of policies) {
    if (!entry) continue;
    if (entry.tools) tools = [...new Set([...(tools ?? []), ...entry.tools])];
    if (entry.paths) paths = [...new Set([...(paths ?? []), ...entry.paths])];
    if (entry.bash) bash = entry.bash;
    if (entry.network) network = entry.network;
    if (entry.env) env = entry.env;
  }

  return { tools, paths, bash, network, env };
}
