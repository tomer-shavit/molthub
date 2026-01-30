import { z } from "zod";
import { MoltbotConfigSchema } from "./moltbot-config";

// =============================================================================
// Molthub Settings (control-plane specific metadata)
// =============================================================================

export const MolthubSettingsSchema = z.object({
  /** Fleet this instance belongs to. */
  fleetId: z.string().optional(),
  /** Template used to seed initial config. */
  templateId: z.string().optional(),
  /** Policy pack IDs enforced on this instance. */
  enforcedPolicyPackIds: z.array(z.string()).optional(),
  /** Auto-restart on crash. */
  autoRestart: z.boolean().default(true),
  /** Health-check interval in seconds. */
  healthCheckIntervalSec: z.number().int().positive().default(30),
  /** Tags visible in the Molthub dashboard. */
  tags: z.record(z.string()).optional(),
});
export type MolthubSettings = z.infer<typeof MolthubSettingsSchema>;

// =============================================================================
// v2 Environment enum (extends v1 with "local")
// =============================================================================

export const MoltbotEnvironmentSchema = z.enum([
  "dev",
  "staging",
  "prod",
  "local",
]);
export type MoltbotEnvironment = z.infer<typeof MoltbotEnvironmentSchema>;

// =============================================================================
// v2 Deployment Target
// =============================================================================

export const DeploymentTargetSchema = z.enum([
  "local",
  "docker",
  "ecs",
  "kubernetes",
  "fly",
]);
export type DeploymentTarget = z.infer<typeof DeploymentTargetSchema>;

// =============================================================================
// Security Overrides
// =============================================================================

export const SecurityOverridesSchema = z.object({
  allowOpenGateway: z.boolean().default(false),
  allowSandboxOff: z.boolean().default(false),
  allowOpenDmPolicy: z.boolean().default(false),
});
export type SecurityOverrides = z.infer<typeof SecurityOverridesSchema>;

// =============================================================================
// v2 Manifest — wraps MoltbotConfigSchema
// =============================================================================

export const MoltbotManifestSchema = z.object({
  apiVersion: z.literal("molthub/v2"),
  kind: z.literal("MoltbotInstance"),
  metadata: z.object({
    name: z
      .string()
      .regex(/^[a-z0-9-]+$/, "Must be lowercase alphanumeric with hyphens")
      .regex(/^[a-z0-9]/, "Must start with alphanumeric")
      .regex(/[a-z0-9]$/, "Must end with alphanumeric")
      .regex(/^(?!.*--)/, "Cannot contain consecutive hyphens")
      .min(1)
      .max(63),
    workspace: z.string().min(1),
    environment: MoltbotEnvironmentSchema.default("dev"),
    labels: z.record(z.string()).default({}),
    deploymentTarget: DeploymentTargetSchema.default("local"),
    profileName: z.string().optional(),
    securityOverrides: SecurityOverridesSchema.optional(),
  }),
  spec: z.object({
    moltbotConfig: MoltbotConfigSchema,
    molthubSettings: MolthubSettingsSchema.optional(),
  }),
});
export type MoltbotManifest = z.infer<typeof MoltbotManifestSchema>;

/**
 * Parse & validate a v2 Moltbot manifest.
 */
export function validateMoltbotManifest(data: unknown): MoltbotManifest {
  return MoltbotManifestSchema.parse(data);
}
