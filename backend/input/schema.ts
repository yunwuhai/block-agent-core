import { z } from "zod";

// --- Multi-action support ---

export const ActionSchema = z.object({
  toolName: z.string().min(1).describe("Tool name (e.g. read, bash, write, edit)"),
  filePath: z.string().optional().describe("File path for read/write/edit tools"),
  command: z.string().optional().describe("Bash command string for bash tool"),
  url: z.string().optional().describe("URL for network fetch tool"),
  envVar: z.string().optional().describe("Environment variable name"),
});

export type ActionParams = z.infer<typeof ActionSchema>;

export const ToolParamsSchema = z.object({
  profile: z.string().describe("Profile name to invoke"),
  task: z.string().describe("Task to delegate"),
  runId: z.string().optional().describe("Explicit run ID for continuation or readback"),
  actions: z.array(ActionSchema).optional().describe("Explicit action sequence (e.g. mkdir → write). Falls back to single read if omitted."),
});

export type ToolParams = z.infer<typeof ToolParamsSchema>;

// --- Hook configuration (TypeScript-based, multi-script, per-tool hooks) ---

export const ToolHookSchema = z.object({
  before: z.array(z.string()).optional(),
  after: z.array(z.string()).optional(),
});

export const HooksConfigSchema = z.object({
  before_agent: z.array(z.string()).optional(),
  after_agent: z.array(z.string()).optional(),
  tools: z.record(z.string(), ToolHookSchema).optional(),
  timeoutMs: z.number().positive().optional(),
});

export type HooksConfig = z.infer<typeof HooksConfigSchema>;

// --- Profile configuration ---

export const ProfileFrontmatterSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  tools: z.array(z.string()).optional(),
  hooks: HooksConfigSchema.optional(),
});

export type ProfileFrontmatter = z.infer<typeof ProfileFrontmatterSchema>;

export interface ProfileDefinition {
  readonly frontmatter: ProfileFrontmatter;
  readonly prompt: string;
}

// --- Project-level policy (single-layer PolicyEntry) ---

export const ProjectPolicySchema = z.object({
  tools: z.array(z.string()).optional(),
  paths: z.array(z.string()).optional(),
  excludePaths: z.array(z.string()).optional(),
  bash: z
    .object({
      allow: z.array(z.string()).optional(),
      deny: z.array(z.string()).optional(),
    })
    .optional(),
  network: z
    .object({
      allow: z.boolean().optional(),
      allowedDomains: z.array(z.string()).optional(),
      deniedDomains: z.array(z.string()).optional(),
    })
    .optional(),
  env: z
    .object({
      allow: z.array(z.string()).optional(),
      deny: z.array(z.string()).optional(),
    })
    .optional(),
});

export type ProjectPolicy = z.infer<typeof ProjectPolicySchema>;
