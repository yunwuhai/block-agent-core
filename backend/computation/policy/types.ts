export interface Policy {
  allowTools?: string[];
  allowPaths?: string[];
  denyPaths?: string[];
  bashRules?: BashRule[];
  networkRules?: NetworkRule[];
  allowSubagent?: boolean;
  allowCapabilities?: string[];
  denyCapabilities?: string[];
}

export interface BashRule {
  allowCommands?: string[];
  denyCommands?: string[];
  allowPatterns?: string[];
  denyPatterns?: string[];
}

export interface NetworkRule {
  allowDomains?: string[];
  denyDomains?: string[];
  allowPorts?: number[];
  allowSchemes?: string[];
}

export interface EvaluationResult {
  allowed: boolean;
  reason?: string;
  rule?: string;
}

export interface Action {
  type: string;
  path?: string;
  command?: string;
  domain?: string;
  env?: string;
}
