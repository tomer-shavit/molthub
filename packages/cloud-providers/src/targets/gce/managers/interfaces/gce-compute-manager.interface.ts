/**
 * GCE Compute Manager Interface
 *
 * Provides abstraction for MIG, Instance Template, and Health Check operations.
 * Caddy-on-VM architecture: MIG manages a single VM with auto-healing.
 */

import type { VmStatus } from "../../types";

/**
 * Configuration for creating a GCE instance template.
 */
export interface InstanceTemplateConfig {
  /** Template name */
  name: string;
  /** Machine type (e.g., "e2-medium") */
  machineType: string;
  /** Boot disk size in GB */
  bootDiskSizeGb: number;
  /** Source image for boot disk */
  sourceImage: string;
  /** VPC network name */
  networkName: string;
  /** Subnet name */
  subnetName: string;
  /** Network tags for firewall rules */
  networkTags: string[];
  /** Startup script (bash) */
  startupScript: string;
  /** Instance metadata key-value pairs */
  metadata: Array<{ key: string; value: string }>;
  /** Labels for organization */
  labels: Record<string, string>;
  /** Service account scopes */
  scopes?: string[];
}

/**
 * Interface for managing GCE compute resources (MIG-based).
 */
export interface IGceComputeManager {
  // -- Instance Template --

  /** Create a global instance template. Returns self-link URL. */
  createInstanceTemplate(config: InstanceTemplateConfig): Promise<string>;
  /** Delete an instance template. */
  deleteInstanceTemplate(name: string): Promise<void>;

  // -- Health Check --

  /** Create a global HTTP health check. Returns self-link URL. */
  createHealthCheck(name: string, port: number, path: string): Promise<string>;
  /** Delete a health check. */
  deleteHealthCheck(name: string): Promise<void>;

  // -- Managed Instance Group --

  /** Create a zonal MIG with auto-healing. Target size = 1. */
  createMig(name: string, templateUrl: string, healthCheckUrl: string): Promise<void>;
  /** Scale MIG to the given size (0 = stop, 1 = start). */
  scaleMig(name: string, size: number): Promise<void>;
  /** Delete a MIG. */
  deleteMig(name: string): Promise<void>;
  /** Get the ephemeral public IP of the MIG's managed instance. */
  getMigInstanceIp(migName: string): Promise<string>;
  /** Get the MIG status based on target size and instance state. */
  getMigStatus(migName: string): Promise<"RUNNING" | "STOPPED" | "UNKNOWN">;
  /** Recreate all instances in the MIG (triggers re-provisioning). */
  recreateMigInstances(migName: string): Promise<void>;
  /** Update the MIG to use a different instance template. */
  setMigInstanceTemplate(migName: string, templateUrl: string): Promise<void>;
  /** Get the current instance template URL from the MIG. */
  getMigInstanceTemplate(migName: string): Promise<string>;

  // -- Direct instance operations --

  /** Get VM instance status (used for detailed status checks). */
  getInstanceStatus(instanceName: string): Promise<VmStatus>;
}
