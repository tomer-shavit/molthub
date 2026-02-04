/**
 * BotInstance Segregated Schemas
 *
 * Zod schemas corresponding to each segregated interface.
 * These schemas allow validation of partial instance data.
 */

import { z } from "zod";
import { BotStatus, BotHealth } from "./status";

// ── Core Identity Schema ─────────────────────────────────────────────────
export const BotIdentitySchema = z.object({
  id: z.string(),
  name: z.string()
    .regex(/^[a-z0-9-]+$/, "Must be lowercase alphanumeric with hyphens")
    .regex(/^[a-z]/, "Must start with a letter")
    .regex(/[a-z0-9]$/, "Must end with alphanumeric")
    .regex(/^(?!.*--)/, "Cannot contain consecutive hyphens")
    .min(1).max(63),
  workspaceId: z.string(),
  fleetId: z.string(),
  createdAt: z.coerce.date(),
  createdBy: z.string(),
});

export type BotIdentity = z.infer<typeof BotIdentitySchema>;

// ── Configuration References Schema ──────────────────────────────────────
export const BotConfigRefsSchema = z.object({
  templateId: z.string().nullable().default(null),
  profileId: z.string().nullable().default(null),
  overlayIds: z.array(z.string())
    .default([])
    .refine(
      (ids) => new Set(ids).size === ids.length,
      { message: "Duplicate overlay IDs are not allowed" }
    ),
  desiredManifest: z.record(z.unknown()).default({}),
  configHash: z.string().nullable().default(null),
});

export type BotConfigRefs = z.infer<typeof BotConfigRefsSchema>;

// ── Runtime State Schema ─────────────────────────────────────────────────
export const BotRuntimeStateSchema = z.object({
  status: BotStatus.default("CREATING"),
  health: BotHealth.default("UNKNOWN"),
  lastReconcileAt: z.union([z.date(), z.null()]).optional().transform((val) => val === undefined ? null : val === null ? null : new Date(val)),
  lastHealthCheckAt: z.union([z.date(), z.null()]).optional().transform((val) => val === undefined ? null : val === null ? null : new Date(val)),
  lastError: z.union([
    z.string(),
    z.object({
      message: z.string(),
      stack: z.string().optional(),
      timestamp: z.coerce.date().optional(),
    }),
    z.null(),
  ]).optional().default(null),
  errorCount: z.number().int().min(0).default(0),
});

export type BotRuntimeState = z.infer<typeof BotRuntimeStateSchema>;

// ── Health Metrics Schema ────────────────────────────────────────────────
export const BotHealthMetricsSchema = z.object({
  uptimeSeconds: z.number().int().min(0).default(0),
  restartCount: z.number().int().min(0).default(0),
  runningSince: z.union([z.date(), z.null()]).optional().transform((val) => val === undefined ? null : val),
});

export type BotHealthMetrics = z.infer<typeof BotHealthMetricsSchema>;

// ── Deployment Info Schema ───────────────────────────────────────────────
export const BotDeploymentInfoSchema = z.object({
  deploymentType: z.string().nullable().default(null),
  deploymentTargetId: z.string().nullable().default(null),
  gatewayPort: z.number().int().nullable().default(null),
  profileName: z.string().nullable().default(null),
  openclawVersion: z.string().nullable().default(null),
});

export type BotDeploymentInfo = z.infer<typeof BotDeploymentInfoSchema>;

// ── Legacy ECS Resources Schema ──────────────────────────────────────────
/**
 * @deprecated Use BotDeploymentInfoSchema for new deployments.
 */
export const BotEcsResourcesSchema = z.object({
  ecsClusterArn: z.string().optional(),
  ecsServiceArn: z.string().optional(),
  taskDefinitionArn: z.string().optional(),
  cloudwatchLogGroup: z.string().optional(),
});

export type BotEcsResources = z.infer<typeof BotEcsResourcesSchema>;

// ── View Schemas ─────────────────────────────────────────────────────────
export const BotInstanceListViewSchema = BotIdentitySchema.merge(BotRuntimeStateSchema);
export type BotInstanceListView = z.infer<typeof BotInstanceListViewSchema>;

export const BotInstanceConfigViewSchema = BotIdentitySchema
  .merge(BotConfigRefsSchema)
  .merge(BotDeploymentInfoSchema);
export type BotInstanceConfigView = z.infer<typeof BotInstanceConfigViewSchema>;

export const BotInstanceHealthViewSchema = BotIdentitySchema
  .merge(BotRuntimeStateSchema)
  .merge(BotHealthMetricsSchema);
export type BotInstanceHealthView = z.infer<typeof BotInstanceHealthViewSchema>;

export const BotInstanceDeploymentViewSchema = BotIdentitySchema
  .merge(BotDeploymentInfoSchema)
  .merge(BotEcsResourcesSchema);
export type BotInstanceDeploymentView = z.infer<typeof BotInstanceDeploymentViewSchema>;

// ── Validation Helpers ───────────────────────────────────────────────────
export function validateBotIdentity(data: unknown): BotIdentity {
  return BotIdentitySchema.parse(data);
}

export function validateBotConfigRefs(data: unknown): BotConfigRefs {
  return BotConfigRefsSchema.parse(data);
}

export function validateBotRuntimeState(data: unknown): BotRuntimeState {
  return BotRuntimeStateSchema.parse(data);
}

export function validateBotHealthMetrics(data: unknown): BotHealthMetrics {
  return BotHealthMetricsSchema.parse(data);
}

export function validateBotDeploymentInfo(data: unknown): BotDeploymentInfo {
  return BotDeploymentInfoSchema.parse(data);
}

export function validateBotInstanceListView(data: unknown): BotInstanceListView {
  return BotInstanceListViewSchema.parse(data);
}

export function validateBotInstanceConfigView(data: unknown): BotInstanceConfigView {
  return BotInstanceConfigViewSchema.parse(data);
}

export function validateBotInstanceHealthView(data: unknown): BotInstanceHealthView {
  return BotInstanceHealthViewSchema.parse(data);
}

export function validateBotInstanceDeploymentView(data: unknown): BotInstanceDeploymentView {
  return BotInstanceDeploymentViewSchema.parse(data);
}
