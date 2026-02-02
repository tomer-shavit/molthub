import { z } from "zod";
import { InstanceManifestSchema, Environment } from "./manifest";

// Fleet: Grouping concept for environments
export const FleetStatus = z.enum(["ACTIVE", "PAUSED", "DRAINING", "ERROR"]);
export type FleetStatus = z.infer<typeof FleetStatus>;

export const FleetSchema = z.object({
  id: z.string(),
  name: z.string()
    .regex(/^[a-z0-9-]+$/, "Must be lowercase alphanumeric with hyphens")
    .regex(/^[a-z]/, "Must start with a letter")
    .regex(/[a-z0-9]$/, "Must end with alphanumeric")
    .regex(/^(?!.*--)/, "Cannot contain consecutive hyphens")
    .min(1).max(63),
  workspaceId: z.string(),
  environment: Environment,
  description: z.string().max(1000, "Description must be 1000 characters or less").optional(),
  status: FleetStatus.default("ACTIVE"),
  tags: z.record(
    z.string().max(256, "Tag value must be 256 characters or less"),
    z.string().max(128, "Tag key must be 128 characters or less").regex(/^[a-zA-Z0-9\-_\.]+$/, "Tag keys can only contain alphanumeric characters, hyphens, underscores, and periods")
  )
    .default({})
    .refine(
      (tags) => Object.keys(tags).length <= 50,
      { message: "Too many tags (max 50)" }
    ),
  
  // Default configurations applied to all instances in fleet
  defaultProfileId: z.string().optional(),
  enforcedPolicyPackIds: z.array(z.string())
    .default([])
    .refine(
      (ids) => new Set(ids).size === ids.length,
      { message: "Duplicate policy pack IDs are not allowed" }
    ),
  
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Fleet = z.infer<typeof FleetSchema>;

// BotInstance: Enhanced instance with fleet association and overlays
export const BotStatus = z.enum([
  "CREATING",
  "PENDING",
  "RUNNING",
  "DEGRADED",
  "STOPPED",
  "PAUSED",
  "DELETING",
  "ERROR",
  "RECONCILING"
]);
export type BotStatus = z.infer<typeof BotStatus>;

export const BotHealth = z.enum(["HEALTHY", "UNHEALTHY", "UNKNOWN", "DEGRADED"]);
export type BotHealth = z.infer<typeof BotHealth>;

export const BotInstanceSchema = z.object({
  id: z.string(),
  name: z.string()
    .regex(/^[a-z0-9-]+$/, "Must be lowercase alphanumeric with hyphens")
    .regex(/^[a-z]/, "Must start with a letter")
    .regex(/[a-z0-9]$/, "Must end with alphanumeric")
    .regex(/^(?!.*--)/, "Cannot contain consecutive hyphens")
    .min(1).max(63),
  workspaceId: z.string(),
  fleetId: z.string(), // Associated with a fleet
  
  // Configuration layers
  templateId: z.string().optional(), // Base template used
  profileId: z.string().optional(), // Applied profile
  overlayIds: z.array(z.string())
    .default([])
    .refine(
      (ids) => new Set(ids).size === ids.length,
      { message: "Duplicate overlay IDs are not allowed" }
    ), // Applied overlays in order
  
  // Current state
  status: BotStatus.default("CREATING"),
  health: BotHealth.default("UNKNOWN"),
  desiredManifest: InstanceManifestSchema,
  appliedManifestVersion: z.string().optional().nullable(), // Last successfully applied
  
  // Operational metadata
  tags: z.record(z.string()).default({}),
  metadata: z.record(z.unknown()).default({}),
  
  // Runtime info
  lastReconcileAt: z.union([z.date(), z.null()]).optional().transform((val) => val === undefined ? undefined : val === null ? null : new Date(val)),
  lastHealthCheckAt: z.union([z.date(), z.null()]).optional().transform((val) => val === undefined ? undefined : val === null ? null : new Date(val)),
  lastError: z.union([
    z.string(),
    z.object({
      message: z.string(),
      stack: z.string().optional(),
      timestamp: z.coerce.date().optional(),
    }),
  ]).optional().nullable(),
  errorCount: z.number().int().min(0).default(0),
  
  // AWS resources (populated by reconciler)
  ecsClusterArn: z.string().optional(),
  ecsServiceArn: z.string().optional(),
  taskDefinitionArn: z.string().optional(),
  cloudwatchLogGroup: z.string().optional(),
  
  // Health metrics
  uptimeSeconds: z.number().int().min(0).default(0),
  restartCount: z.number().int().min(0).default(0),
  
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  createdBy: z.string(),
});

export type BotInstance = z.infer<typeof BotInstanceSchema>;

// BotInstance with resolved configuration (after applying profile + overlays)
export const ResolvedBotConfigSchema = z.object({
  botId: z.string(),
  fleetId: z.string(),
  workspaceId: z.string(),
  
  // Source of each config layer
  baseTemplate: z.string().optional(),
  appliedProfile: z.string().optional(),
  appliedOverlays: z.array(z.string()).default([]),
  
  // Final resolved manifest
  manifest: InstanceManifestSchema,
  
  // Policy packs that were enforced
  enforcedPolicyPacks: z.array(z.string()).default([]),
  
  // Validation results
  validationErrors: z.array(z.object({
    code: z.string(),
    message: z.string(),
    field: z.string().optional(),
  })).default([]),
  
  resolvedAt: z.date(),
});

export type ResolvedBotConfig = z.infer<typeof ResolvedBotConfigSchema>;

// Validation helpers
export function validateFleet(data: unknown): Fleet {
  return FleetSchema.parse(data);
}

export function validateBotInstance(data: unknown): BotInstance {
  return BotInstanceSchema.parse(data);
}

export function validateResolvedConfig(data: unknown): ResolvedBotConfig {
  return ResolvedBotConfigSchema.parse(data);
}