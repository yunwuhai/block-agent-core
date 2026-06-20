import { z } from "zod";

export const ToolParamsSchema = z.strictObject({
  profile: z.string().describe("Profile name to invoke"),
  task: z.string().describe("Task to delegate"),
  runId: z.string().optional().describe("Explicit run ID for continuation or readback"),
});

export type ToolParams = z.infer<typeof ToolParamsSchema>;

export const ProfileFrontmatterSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  model: z.string().optional(),
  tools: z.array(z.string()).optional(),
  hookScripts: z
    .object({
      before_agent: z.string().optional(),
      after_agent: z.string().optional(),
      before_tool: z.string().optional(),
      after_tool: z.string().optional(),
    })
    .optional(),
});

export type ProfileFrontmatter = z.infer<typeof ProfileFrontmatterSchema>;

export interface ProfileDefinition {
  readonly frontmatter: ProfileFrontmatter;
  readonly prompt: string;
}

export const ProjectLockEntrySchema = z.object({
  tools: z.array(z.string()).optional(),
  paths: z.array(z.string()).optional(),
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

export type ProjectLockEntry = z.infer<typeof ProjectLockEntrySchema>;

export const ProjectConfigSchema = z.object({
  locked: ProjectLockEntrySchema.optional(),
  defaults: ProjectLockEntrySchema.optional(),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
