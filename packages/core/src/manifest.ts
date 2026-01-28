import { z } from "zod";

export const InstanceStatus = z.enum([
  "CREATING",
  "RUNNING", 
  "DEGRADED",
  "STOPPED",
  "DELETING",
  "ERROR"
]);

export type InstanceStatus = z.infer<typeof InstanceStatus>;

export const Environment = z.enum(["dev", "staging", "prod"]);
export type Environment = z.infer<typeof Environment>;

export const SecretRefSchema = z.object({
  name: z.string().min(1),
  provider: z.literal("aws-secrets-manager"),
  key: z.string(),
});

export type SecretRef = z.infer<typeof SecretRefSchema>;

export const ChannelConfigSchema = z.object({
  type: z.enum(["slack", "telegram", "webhook", "discord"]),
  enabled: z.boolean().default(true),
  secretRef: SecretRefSchema,
  config: z.record(z.unknown()).optional(),
});

export type ChannelConfig = z.infer<typeof ChannelConfigSchema>;

export const SkillsPolicySchema = z.object({
  mode: z.literal("ALLOWLIST"),
  allowlist: z.array(z.string()).min(1, "At least one skill must be allowed"),
});

export type SkillsPolicy = z.infer<typeof SkillsPolicySchema>;

export const NetworkConfigSchema = z.object({
  inbound: z.enum(["NONE", "WEBHOOK", "PUBLIC"]).default("NONE"),
  egressPreset: z.enum(["NONE", "RESTRICTED", "DEFAULT"]).default("RESTRICTED"),
});

export type NetworkConfig = z.infer<typeof NetworkConfigSchema>;

export const ObservabilityConfigSchema = z.object({
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
  tracing: z.boolean().default(false),
});

export type ObservabilityConfig = z.infer<typeof ObservabilityConfigSchema>;

export const PolicyConfigSchema = z.object({
  forbidPublicAdmin: z.boolean().default(true),
  requireSecretManager: z.boolean().default(true),
});

export type PolicyConfig = z.infer<typeof PolicyConfigSchema>;

export const RuntimeConfigSchema = z.object({
  image: z.string()
    .refine(
      (val) => val.includes(':') && !val.endsWith(':latest'),
      { message: "Must be pinned image tag, not 'latest'" }
    ),
  cpu: z.number().min(0.25).max(16).default(1),
  memory: z.number().min(512).max(65536).default(2048),
  replicas: z.number().int().min(1).max(10).default(1),
  command: z.array(z.string()).optional(),
});

export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

export const InstanceManifestSchema = z.object({
  apiVersion: z.literal("molthub/v1"),
  kind: z.literal("MoltbotInstance"),
  metadata: z.object({
    name: z.string().regex(/^[a-z0-9-]+$/, "Must be lowercase alphanumeric with hyphens").min(1).max(63),
    workspace: z.string().min(1),
    environment: Environment,
    labels: z.record(z.string()).default({}),
  }),
  spec: z.object({
    runtime: RuntimeConfigSchema,
    secrets: z.array(SecretRefSchema).default([]),
    channels: z.array(ChannelConfigSchema).default([]),
    skills: SkillsPolicySchema,
    network: NetworkConfigSchema.default({}),
    observability: ObservabilityConfigSchema.default({}),
    policies: PolicyConfigSchema.default({}),
  }),
});

export type InstanceManifest = z.infer<typeof InstanceManifestSchema>;

export function validateManifest(data: unknown): InstanceManifest {
  return InstanceManifestSchema.parse(data);
}