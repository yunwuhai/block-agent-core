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

// --- Registry entry schema (Prompt Registry) ---

export const LifecycleConfigSchema = z.object({
  type: z.enum(["permanent", "rounds", "time-window", "session"]),
  maxRounds: z.number().positive().optional(),
  validFrom: z.number().optional(),
  validUntil: z.number().optional(),
}).default({ type: "permanent" });

export const FrequencyConfigSchema = z.object({
  maxTotal: z.number().positive().optional(),
  maxPer100: z.number().positive().optional(),
  maxPer50: z.number().positive().optional(),
  maxPer25: z.number().positive().optional(),
}).optional();

export const RegistryEntrySchema = z.object({
  type: z.enum(["custom", "file", "template"]),
  description: z.string(),
  content: z.string().optional(),
  filePath: z.string().optional(),
  memberIds: z.array(z.string()).optional(),
  name: z.string().optional(),
  tags: z.array(z.string()).default([]),
  group: z.string().optional(),
  priority: z.number().default(0),
  lifecycle: LifecycleConfigSchema,
  frequency: FrequencyConfigSchema,
});

export type RegistryEntryInput = z.infer<typeof RegistryEntrySchema>;

// --- Profile configuration ---

export const ProfileFrontmatterSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  tools: z.array(z.string()).optional(),
  placeholders: z.record(z.string(), z.string()).optional(),
  registry: z.array(RegistryEntrySchema).optional(),
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
