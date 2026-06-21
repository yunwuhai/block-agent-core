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
  readonly allowedPorts?: readonly number[];
  readonly deniedPorts?: readonly number[];
  readonly allowedSchemes?: readonly string[];
  readonly deniedSchemes?: readonly string[];
}

export interface EnvRule {
  readonly allow?: readonly string[];
  readonly deny?: readonly string[];
}

export interface PolicyEntry {
  readonly tools?: readonly string[];
  readonly paths?: readonly string[];
  readonly excludePaths?: readonly string[];
  readonly bash?: BashRule;
  readonly network?: NetworkRule;
  readonly env?: EnvRule;
}

export interface MergedPolicy {
  readonly tools: readonly string[] | null;
  readonly paths: readonly string[] | null;
  readonly excludePaths?: readonly string[];
  readonly bash: BashRule | null;
  readonly network: NetworkRule | null;
  readonly env: EnvRule | null;
}

export function mergePolicies(...policies: readonly (PolicyEntry | undefined | null)[]): MergedPolicy {
  let tools: string[] | null = null;
  let paths: string[] | null = null;
  let excludePaths: string[] | undefined = undefined;

  for (const entry of policies) {
    if (!entry) continue;
    // tools, paths, and excludePaths are additive: later entries extend the set
    if (entry.tools) tools = [...new Set([...(tools ?? []), ...entry.tools])];
    if (entry.paths) paths = [...new Set([...(paths ?? []), ...entry.paths])];
    if (entry.excludePaths) excludePaths = [...new Set([...(excludePaths ?? []), ...entry.excludePaths])];
  }

  // Bash: union allow/deny arrays from all policies
  let bash: BashRule | null = null;
  if (policies.some(p => p?.bash?.allow || p?.bash?.deny)) {
    bash = {
      ...(policies.some(p => p?.bash?.allow) ? { allow: [...new Set(policies.flatMap(p => p?.bash?.allow ?? []))] } : {}),
      ...(policies.some(p => p?.bash?.deny) ? { deny: [...new Set(policies.flatMap(p => p?.bash?.deny ?? []))] } : {}),
    };
  }

  // Network: OR semantics for allow, union for domains/ports/schemes
  let network: NetworkRule | null = null;
  if (policies.some(p => p?.network)) {
    const allNets = policies
      .map(p => p?.network)
      .filter((n): n is NetworkRule => n != null);
    network = {
      allow: allNets.some(n => n.allow === true),
      ...(allNets.some(n => n.allowedDomains?.length) ? { allowedDomains: [...new Set(allNets.flatMap(n => n.allowedDomains ?? []))] } : {}),
      ...(allNets.some(n => n.deniedDomains?.length) ? { deniedDomains: [...new Set(allNets.flatMap(n => n.deniedDomains ?? []))] } : {}),
      ...(allNets.some(n => n.allowedPorts?.length) ? { allowedPorts: [...new Set(allNets.flatMap(n => n.allowedPorts ?? []))] } : {}),
      ...(allNets.some(n => n.deniedPorts?.length) ? { deniedPorts: [...new Set(allNets.flatMap(n => n.deniedPorts ?? []))] } : {}),
      ...(allNets.some(n => n.allowedSchemes?.length) ? { allowedSchemes: [...new Set(allNets.flatMap(n => n.allowedSchemes ?? []))] } : {}),
      ...(allNets.some(n => n.deniedSchemes?.length) ? { deniedSchemes: [...new Set(allNets.flatMap(n => n.deniedSchemes ?? []))] } : {}),
    };
  }

  // Env: union allow/deny arrays from all policies
  let env: EnvRule | null = null;
  if (policies.some(p => p?.env?.allow || p?.env?.deny)) {
    env = {
      ...(policies.some(p => p?.env?.allow) ? { allow: [...new Set(policies.flatMap(p => p?.env?.allow ?? []))] } : {}),
      ...(policies.some(p => p?.env?.deny) ? { deny: [...new Set(policies.flatMap(p => p?.env?.deny ?? []))] } : {}),
    };
  }

  return {
    tools,
    paths,
    bash,
    network,
    env,
    ...(excludePaths !== undefined ? { excludePaths } : {}),
  };
}
