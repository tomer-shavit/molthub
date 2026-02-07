/**
 * Deployment Target Abstraction for OpenClaw
 *
 * Provides a unified interface for deploying OpenClaw gateway instances
 * across different environments: local machines, Docker containers,
 * and cloud VMs (AWS ECS, GCE, Azure).
 */

/**
 * Supported deployment target types
 */
export enum DeploymentTargetType {
  LOCAL = "local",
  DOCKER = "docker",
  ECS_EC2 = "ecs-ec2",
  GCE = "gce",
  AZURE_VM = "azure-vm",
}

/**
 * Options for installing an OpenClaw gateway instance on a deployment target
 */
export interface InstallOptions {
  /** Profile name for isolation (scopes config/state/workspace) */
  profileName: string;
  /** Specific OpenClaw version to install */
  openclawVersion?: string;
  /** Gateway port number. Instances should be spaced 20+ ports apart. */
  port: number;
  /** Method to use for installation */
  installMethod?: "curl" | "npm" | "pnpm";
  /** Gateway authentication token (passed as env var for ECS targets) */
  gatewayAuthToken?: string;
  /** Additional container environment variables (e.g., LLM API keys) */
  containerEnv?: Record<string, string>;
}

/**
 * Result of an install operation
 */
export interface InstallResult {
  success: boolean;
  /** Identifier for the installed instance (e.g., service name, container ID) */
  instanceId: string;
  /** Human-readable message about the install outcome */
  message: string;
  /** Service name created (e.g., systemd unit name, launchd label) */
  serviceName?: string;
  /** Installation path on disk */
  installPath?: string;
}

/**
 * OpenClaw configuration payload to be applied to a deployment target
 */
export interface OpenClawConfigPayload {
  /** Profile name this configuration applies to */
  profileName: string;
  /** Gateway port */
  gatewayPort: number;
  /** Additional environment variables */
  environment?: Record<string, string>;
  /** Raw configuration object to serialize */
  config?: Record<string, unknown>;
}

/**
 * Result of a configure operation
 */
export interface ConfigureResult {
  success: boolean;
  message: string;
  /** Whether the target needs a restart for configuration to take effect */
  requiresRestart: boolean;
  /** Path where config was written */
  configPath?: string;
}

/**
 * Gateway WebSocket endpoint information
 */
export interface GatewayEndpoint {
  host: string;
  port: number;
  protocol: "ws" | "wss";
}

/**
 * Current status of a deployment target
 */
export interface TargetStatus {
  state: "running" | "stopped" | "error" | "not-installed";
  /** Process ID (for local/VM targets) */
  pid?: number;
  /** Uptime in seconds */
  uptime?: number;
  /** Gateway port the instance is listening on */
  gatewayPort?: number;
  /** Error message when state is "error" */
  error?: string;
}

/**
 * Options for retrieving logs from a deployment target
 */
export interface DeploymentLogOptions {
  /** Number of lines to retrieve */
  lines?: number;
  /** Whether to follow/tail the log output */
  follow?: boolean;
  /** Start time filter */
  since?: Date;
  /** Filter pattern (grep-style) */
  filter?: string;
}

/**
 * Unified interface for OpenClaw deployment targets.
 *
 * Each deployment target represents a distinct environment where a
 * OpenClaw gateway instance can be installed, configured, and managed.
 * Implementations handle the specifics of each environment (systemd,
 * Docker, cloud VMs, etc.) behind this common interface.
 */
export interface DeploymentTarget {
  /** The type of deployment target */
  readonly type: DeploymentTargetType;

  /**
   * Install the OpenClaw gateway on this target.
   * For local: runs `openclaw gateway install`.
   * For Docker: ensures the container image is available (check local, build, or pull).
   * For cloud VMs: provisions infrastructure via CloudFormation/Terraform.
   */
  install(options: InstallOptions): Promise<InstallResult>;

  /**
   * Apply configuration to the installed OpenClaw instance.
   * Writes config files, updates ConfigMaps, or sets environment variables
   * depending on the target type.
   */
  configure(config: OpenClawConfigPayload): Promise<ConfigureResult>;

  /**
   * Start the OpenClaw gateway instance.
   * For local: starts the service via systemctl/launchctl.
   * For Docker: runs/starts the container.
   * For cloud VMs: starts the VM/ECS service.
   */
  start(): Promise<void>;

  /**
   * Stop the OpenClaw gateway instance gracefully (SIGTERM).
   */
  stop(): Promise<void>;

  /**
   * Restart the OpenClaw gateway instance.
   * May use SIGUSR1 for hybrid reload when only configuration changed.
   */
  restart(): Promise<void>;

  /**
   * Get the current status of the deployment target.
   */
  getStatus(): Promise<TargetStatus>;

  /**
   * Retrieve log lines from the OpenClaw gateway instance.
   */
  getLogs(options?: DeploymentLogOptions): Promise<string[]>;

  /**
   * Get the WebSocket endpoint for the gateway.
   */
  getEndpoint(): Promise<GatewayEndpoint>;

  /**
   * Tear down and remove the OpenClaw instance from this target.
   * Stops the service, removes files/containers/manifests, and cleans up.
   */
  destroy(): Promise<void>;

  /**
   * Set a callback to receive real-time log output from commands.
   * Used during provisioning to stream build/startup logs to the UI.
   * Optional — not all targets support streaming.
   */
  setLogCallback?(cb: (line: string, stream: "stdout" | "stderr") => void): void;

  /**
   * Update resource allocation for a running deployment.
   * For ECS: Updates task definition and service.
   * For GCE: Stops VM, resizes machine type/disk, restarts.
   * For Azure: Deallocates VM, resizes, restarts.
   * Optional — not all targets support resource updates.
   */
  updateResources?(spec: ResourceSpec): Promise<ResourceUpdateResult>;

  /**
   * Get current resource allocation.
   * Returns the current CPU, memory, and disk configuration.
   * Optional — not all targets support resource queries.
   */
  getResources?(): Promise<ResourceSpec>;
}

// ── Configuration types for specific targets ──

/**
 * Configuration for Docker container targets
 */
export interface DockerTargetConfig {
  /** Docker image name (default: "openclaw:local") */
  imageName?: string;
  /** Path to Dockerfile directory for building the image locally */
  dockerfilePath?: string;
  /** Name for the container */
  containerName: string;
  /** Local path to mount as config volume */
  configPath: string;
  /** Gateway port to expose */
  gatewayPort: number;
  /** Docker network to attach to */
  networkName?: string;
}

import type { AwsEc2Config } from "../targets/ecs-ec2/aws-ec2-config";
import type { AzureVmConfig } from "../targets/azure-vm/azure-vm-config";
import type { GceConfig } from "../targets/gce/gce-config";
import type { ResourceSpec, ResourceUpdateResult } from "./resource-spec";
export type { AwsEc2Config } from "../targets/ecs-ec2/aws-ec2-config";
export type { AzureVmConfig } from "../targets/azure-vm/azure-vm-config";
export type { GceConfig } from "../targets/gce/gce-config";
export type {
  ResourceSpec,
  ResourceUpdateResult,
  ResourceTier,
  TierSpec,
  TierDisplayInfo,
  TierSpecRegistry,
} from "./resource-spec";
export {
  TIER_DISPLAY_INFO,
  getTierSpecFromRegistry,
  specToTierFromRegistry,
} from "./resource-spec";

export type DeploymentTargetConfig =
  | { type: "local" }
  | { type: "docker"; docker: DockerTargetConfig }
  | { type: "ecs-ec2"; ecs: AwsEc2Config }
  | { type: "gce"; gce: GceConfig }
  | { type: "azure-vm"; azureVm: AzureVmConfig };

// ── Utility types ──

/**
 * Detected operating system for local targets
 */
export type DetectedOS = "macos" | "linux" | "wsl2";

/**
 * Minimum port spacing between OpenClaw instances.
 * Each instance uses a range of derived ports, so instances
 * must be spaced at least this many ports apart.
 */
export const MIN_PORT_SPACING = 20;

/**
 * Validates that a set of ports are spaced at least MIN_PORT_SPACING apart.
 * @param ports - Array of port numbers to validate
 * @returns Object with validity flag and any conflicting port pairs
 */
export function validatePortSpacing(
  ports: number[]
): { valid: boolean; conflicts: Array<{ portA: number; portB: number; spacing: number }> } {
  const sorted = [...ports].sort((a, b) => a - b);
  const conflicts: Array<{ portA: number; portB: number; spacing: number }> = [];

  for (let i = 1; i < sorted.length; i++) {
    const spacing = sorted[i] - sorted[i - 1];
    if (spacing < MIN_PORT_SPACING) {
      conflicts.push({
        portA: sorted[i - 1],
        portB: sorted[i],
        spacing,
      });
    }
  }

  return { valid: conflicts.length === 0, conflicts };
}
