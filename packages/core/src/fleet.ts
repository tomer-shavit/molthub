import { z } from "zod";
import { InstanceManifestSchema, Environment } from "./manifest";

// Fleet: Grouping concept for environments
export const FleetStatus = z.enum(["ACTIVE", "PAUSED", "DRAINING", "ERROR"]);
export type FleetStatus = z.infer<typeof FleetStatus>;

export const FleetSchema = z.object({
  id: z.string(),
  name: z.string().regex(/^[a-z0-9-]+$/, "Must be lowercase alphanumeric with hyphens").min(1).max(63),
  workspaceId: z.string(),
  environment: Environment,
  description: z.string().optional(),
  status: FleetStatus.default("ACTIVE"),
  tags: z.record(z.string()).default({}),
  
  // Infrastructure references
  ecsClusterArn: z.string().optional(),
  vpcId: z.string().optional(),
  privateSubnetIds: z.array(z.string()).default([]),
  securityGroupId: z.string().optional(),
  
  // Default configurations applied to all instances in fleet
  defaultProfileId: z.string().optional(),
  enforcedPolicyPackIds: z.array(z.string()).default([]),
  
  createdAt: z.date(),
  updatedAt: z.date(),
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
  name: z.string().regex(/^[a-z0-9-]+$/, "Must be lowercase alphanumeric with hyphens").min(1).max(63),
  workspaceId: z.string(),
  fleetId: z.string(), // Associated with a fleet
  
  // Configuration layers
  templateId: z.string().optional(), // Base template used
  profileId: z.string().optional(), // Applied profile
  overlayIds: z.array(z.string()).default([]), // Applied overlays in order
  
  // Current state
  status: BotStatus.default("CREATING"),
  health: BotHealth.default("UNKNOWN"),
  desiredManifest: InstanceManifestSchema,
  appliedManifestVersion: z.string().optional(), // Last successfully applied
  
  // Operational metadata
  tags: z.record(z.string()).default({}),
  metadata: z.record(z.unknown()).default({}),
  
  // Runtime info
  lastReconcileAt: z.date().optional(),
  lastHealthCheckAt: z.date().optional(),
  lastError: z.string().optional(),
  errorCount: z.number().int().min(0).default(0),
  
  // AWS resources (populated by reconciler)
  ecsClusterArn: z.string().optional(),
  ecsServiceArn: z.string().optional(),
  taskDefinitionArn: z.string().optional(),
  cloudwatchLogGroup: z.string().optional(),
  
  // Health metrics
  uptimeSeconds: z.number().int().min(0).default(0),
  restartCount: z.number().int().min(0).default(0),
  
  createdAt: z.date(),
  updatedAt: z.date(),
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