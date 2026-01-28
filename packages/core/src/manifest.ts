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

const skillNameSchema = z.string().regex(
  /^[a-z0-9-]+$/,
  "Skill names must be lowercase alphanumeric with hyphens only"
);

export const SkillsPolicySchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("ALLOWLIST"),
    allowlist: z.array(skillNameSchema).min(1, "At least one skill must be allowed"),
  }),
  z.object({
    mode: z.literal("DENYLIST"),
    denylist: z.array(skillNameSchema).min(1, "At least one skill must be denied"),
  }),
  z.object({
    mode: z.literal("ALL"),
  }),
]);

export type SkillsPolicy = z.infer<typeof SkillsPolicySchema>;

// Partial skills policy for overlays (all fields optional)
export const PartialSkillsPolicySchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("ALLOWLIST"),
    allowlist: z.array(skillNameSchema).optional(),
  }),
  z.object({
    mode: z.literal("DENYLIST"),
    denylist: z.array(skillNameSchema).optional(),
  }),
  z.object({
    mode: z.literal("ALL"),
  }),
]);

export type PartialSkillsPolicy = z.infer<typeof PartialSkillsPolicySchema>;

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

const pinnedTagPattern = /^(v?\d+\.\d+\.?\d*.*|\d{4}[.-]\d{2}[.-]\d{2}|sha-[a-f0-9]+|\d+)$/i;

export const RuntimeConfigSchema = z.object({
  image: z.string()
    .refine(
      (val) => val.includes(':') && !val.endsWith(':latest') && !val.endsWith(':stable'),
      { message: "Must be pinned image tag, not 'latest' or 'stable'" }
    )
    .refine(
      (val) => {
        const tag = val.split(':').pop() || '';
        return pinnedTagPattern.test(tag);
      },
      { message: "Tag must be a semantic version (e.g., v1.0.0, 1.2.3)" }
    ),
  cpu: z.number().min(0.25).max(16).default(1),
  memory: z.number().min(256).max(65536).default(2048),
  replicas: z.number().int().min(1).max(100).default(1),
  command: z.array(z.string()).optional(),
});

export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

export const InstanceManifestSchema = z.object({
  apiVersion: z.literal("molthub/v1"),
  kind: z.literal("MoltbotInstance"),
  metadata: z.object({
    name: z.string()
      .regex(/^[a-z0-9-]+$/, "Must be lowercase alphanumeric with hyphens")
      .regex(/^[a-z0-9]/, "Must start with alphanumeric")
      .regex(/[a-z0-9]$/, "Must end with alphanumeric")
      .regex(/^(?!.*--)/, "Cannot contain consecutive hyphens")
      .min(1).max(63),
    workspace: z.string()
      .regex(/^[a-z0-9-]+$/, "Must be lowercase alphanumeric with hyphens")
      .min(1),
    environment: Environment,
    labels: z.record(z.string())
      .default({})
      .refine(
        (labels) => Object.keys(labels).length <= 64,
        { message: "Too many labels (max 64)" }
      )
      .refine(
        (labels) => Object.keys(labels).every(key => key.length > 0),
        { message: "Label keys cannot be empty" }
      ),
  }),
  spec: z.object({
    runtime: RuntimeConfigSchema,
    secrets: z.array(SecretRefSchema)
      .default([])
      .refine(
        (secrets) => {
          const names = secrets.map(s => s.name);
          return new Set(names).size === names.length;
        },
        { message: "Duplicate secret names are not allowed" }
      ),
    channels: z.array(ChannelConfigSchema)
      .default([])
      .refine(
        (channels) => {
          const types = channels.map(c => c.type);
          return new Set(types).size === types.length;
        },
        { message: "Duplicate channel types are not allowed" }
      ),
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