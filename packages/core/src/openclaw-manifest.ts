import { z } from "zod";
import { OpenClawConfigSchema } from "./openclaw-config";

// =============================================================================
// Clawster Settings (control-plane specific metadata)
// =============================================================================

export const ClawsterSettingsSchema = z.object({
  /** Fleet this instance belongs to. */
  fleetId: z.string().optional(),
  /** Template used to seed initial config. */
  templateId: z.string().optional(),
  /** Auto-restart on crash. */
  autoRestart: z.boolean().default(true),
  /** Health-check interval in seconds. */
  healthCheckIntervalSec: z.number().int().positive().default(30),
  /** Tags visible in the Clawster dashboard. */
  tags: z.record(z.string()).optional(),
});
export type ClawsterSettings = z.infer<typeof ClawsterSettingsSchema>;

// =============================================================================
// v2 Environment enum (extends v1 with "local")
// =============================================================================

export const OpenClawEnvironmentSchema = z.enum([
  "dev",
  "staging",
  "prod",
  "local",
]);
export type OpenClawEnvironment = z.infer<typeof OpenClawEnvironmentSchema>;

// =============================================================================
// v2 Deployment Target
// =============================================================================

export const DeploymentTargetSchema = z.enum([
  "local",
  "docker",
  "ecs",
  "gce",
  "azure-vm",
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
// v2 Manifest — wraps OpenClawConfigSchema
// =============================================================================

export const OpenClawManifestSchema = z.object({
  apiVersion: z.literal("clawster/v2"),
  kind: z.literal("OpenClawInstance"),
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
    environment: OpenClawEnvironmentSchema.default("dev"),
    labels: z.record(z.string()).default({}),
    deploymentTarget: DeploymentTargetSchema.default("local"),
    profileName: z.string().optional(),
    securityOverrides: SecurityOverridesSchema.optional(),
  }),
  spec: z.object({
    openclawConfig: OpenClawConfigSchema,
    clawsterSettings: ClawsterSettingsSchema.optional(),
  }),
});
export type OpenClawManifest = z.infer<typeof OpenClawManifestSchema>;

/**
 * Parse & validate a v2 OpenClaw manifest.
 */
export function validateOpenClawManifest(data: unknown): OpenClawManifest {
  return OpenClawManifestSchema.parse(data);
}
