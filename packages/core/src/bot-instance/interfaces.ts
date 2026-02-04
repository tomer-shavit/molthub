/**
 * BotInstance Segregated Interfaces (ISP)
 *
 * Segregated interfaces for BotInstance following Interface Segregation Principle.
 * Each interface represents a distinct concern that consumers can depend on independently.
 */

import type { BotStatus, BotHealth } from "./status";

// ── Core Identity ────────────────────────────────────────────────────────
/**
 * Immutable identity fields that define a bot instance.
 * These fields should never change after creation.
 */
export interface IBotIdentity {
  readonly id: string;
  readonly name: string;
  readonly workspaceId: string;
  readonly fleetId: string;
  readonly createdAt: Date;
  readonly createdBy: string;
}

// ── Configuration References ─────────────────────────────────────────────
/**
 * References to configuration layers applied to the instance.
 * Used by the reconciler to compute the desired manifest.
 */
export interface IBotConfigRefs {
  templateId: string | null;
  profileId: string | null;
  overlayIds: string[];
  desiredManifest: Record<string, unknown>;
  configHash: string | null;
}

// ── Runtime Operational State ────────────────────────────────────────────
/**
 * Current operational state of the instance.
 * Used for status display and reconciliation decisions.
 */
export interface IBotRuntimeState {
  status: BotStatus;
  health: BotHealth;
  lastReconcileAt: Date | null;
  lastHealthCheckAt: Date | null;
  lastError: string | { message: string; stack?: string; timestamp?: Date } | null;
  errorCount: number;
}

// ── Health Metrics ───────────────────────────────────────────────────────
/**
 * Health and uptime metrics for monitoring.
 * Used by dashboards and alerting systems.
 */
export interface IBotHealthMetrics {
  uptimeSeconds: number;
  restartCount: number;
  runningSince?: Date | null;
}

// ── Deployment Information ───────────────────────────────────────────────
/**
 * Deployment target information.
 * Describes where and how the instance is deployed.
 */
export interface IBotDeploymentInfo {
  deploymentType: string | null;
  deploymentTargetId: string | null;
  gatewayPort: number | null;
  profileName: string | null;
  openclawVersion: string | null;
}

/**
 * @deprecated Legacy ECS-specific fields. Use cloud-agnostic deployment info instead.
 * These fields will be removed in a future version.
 */
export interface IBotEcsResources {
  /** @deprecated Use IBotDeploymentInfo instead */
  ecsClusterArn?: string;
  /** @deprecated Use IBotDeploymentInfo instead */
  ecsServiceArn?: string;
  /** @deprecated Use IBotDeploymentInfo instead */
  taskDefinitionArn?: string;
  /** @deprecated Use IBotDeploymentInfo instead */
  cloudwatchLogGroup?: string;
}

// ── Composed Types ───────────────────────────────────────────────────────
/**
 * Full BotInstance interface - composition of all segregated interfaces.
 * Use this when you need access to all instance properties.
 */
export interface IBotInstance extends
  IBotIdentity,
  IBotConfigRefs,
  IBotRuntimeState,
  IBotHealthMetrics,
  IBotDeploymentInfo,
  IBotEcsResources {
  /** Additional metadata that doesn't fit other categories */
  tags: Record<string, string>;
  metadata: Record<string, unknown>;
  appliedManifestVersion: string | null;
  updatedAt: Date;
}

// ── View Types ───────────────────────────────────────────────────────────
/**
 * Minimal view for list displays.
 * Contains only essential fields for rendering instance lists.
 */
export type BotInstanceListView = IBotIdentity & IBotRuntimeState;

/**
 * Config-focused view for the reconciler.
 * Contains identity, config refs, and deployment info.
 */
export type BotInstanceConfigView = IBotIdentity & IBotConfigRefs & IBotDeploymentInfo;

/**
 * Health-focused view for monitoring.
 * Contains identity, runtime state, and health metrics.
 */
export type BotInstanceHealthView = IBotIdentity & IBotRuntimeState & IBotHealthMetrics;

/**
 * Deployment-focused view for infrastructure operations.
 * Contains identity and deployment information.
 */
export type BotInstanceDeploymentView = IBotIdentity & IBotDeploymentInfo & IBotEcsResources;
