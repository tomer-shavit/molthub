/**
 * Deployment Target Abstraction for Moltbot
 *
 * Provides a unified interface for deploying Moltbot gateway instances
 * across different environments: local machines, remote VMs, Docker
 * containers, and Kubernetes clusters.
 */

/**
 * Supported deployment target types
 */
export enum DeploymentTargetType {
  LOCAL = "local",
  REMOTE_VM = "remote-vm",
  DOCKER = "docker",
  ECS_FARGATE = "ecs-fargate",
  CLOUD_RUN = "cloud-run",
  ACI = "aci",
  KUBERNETES = "kubernetes",
  CLOUDFLARE_WORKERS = "cloudflare-workers",
}

/**
 * Options for installing a Moltbot gateway instance on a deployment target
 */
export interface InstallOptions {
  /** Profile name for isolation (scopes config/state/workspace) */
  profileName: string;
  /** Specific Moltbot version to install */
  moltbotVersion?: string;
  /** Gateway port number. Instances should be spaced 20+ ports apart. */
  port: number;
  /** Method to use for installation */
  installMethod?: "curl" | "npm" | "pnpm";
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
 * Moltbot configuration payload to be applied to a deployment target
 */
export interface MoltbotConfigPayload {
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
 * Unified interface for Moltbot deployment targets.
 *
 * Each deployment target represents a distinct environment where a
 * Moltbot gateway instance can be installed, configured, and managed.
 * Implementations handle the specifics of each environment (systemd,
 * Docker, Kubernetes, etc.) behind this common interface.
 */
export interface DeploymentTarget {
  /** The type of deployment target */
  readonly type: DeploymentTargetType;

  /**
   * Install the Moltbot gateway on this target.
   * For local/VM: runs `moltbot gateway install`.
   * For Docker: pulls the container image.
   * For Kubernetes: generates and applies manifests.
   */
  install(options: InstallOptions): Promise<InstallResult>;

  /**
   * Apply configuration to the installed Moltbot instance.
   * Writes config files, updates ConfigMaps, or sets environment variables
   * depending on the target type.
   */
  configure(config: MoltbotConfigPayload): Promise<ConfigureResult>;

  /**
   * Start the Moltbot gateway instance.
   * For local: starts the service via systemctl/launchctl.
   * For Docker: runs/starts the container.
   * For Kubernetes: scales replicas up.
   */
  start(): Promise<void>;

  /**
   * Stop the Moltbot gateway instance gracefully (SIGTERM).
   */
  stop(): Promise<void>;

  /**
   * Restart the Moltbot gateway instance.
   * May use SIGUSR1 for hybrid reload when only configuration changed.
   */
  restart(): Promise<void>;

  /**
   * Get the current status of the deployment target.
   */
  getStatus(): Promise<TargetStatus>;

  /**
   * Retrieve log lines from the Moltbot gateway instance.
   */
  getLogs(options?: DeploymentLogOptions): Promise<string[]>;

  /**
   * Get the WebSocket endpoint for the gateway.
   */
  getEndpoint(): Promise<GatewayEndpoint>;

  /**
   * Tear down and remove the Moltbot instance from this target.
   * Stops the service, removes files/containers/manifests, and cleans up.
   */
  destroy(): Promise<void>;
}

// ── Configuration types for specific targets ──

/**
 * SSH connection configuration for remote VM targets
 */
export interface RemoteVMConfig {
  /** Remote host address */
  host: string;
  /** SSH port (default: 22) */
  port: number;
  /** SSH username */
  username: string;
  /** Path to SSH private key file */
  privateKey?: string;
  /** SSH password (prefer privateKey) */
  password?: string;
  /** SSH key fingerprint for verification */
  sshKeyFingerprint?: string;
  /** Disable password-based SSH authentication (default: true) */
  disablePasswordAuth?: boolean;
  /** Additional firewall ports to allow beyond SSH and gateway */
  firewallPorts?: number[];
  /** Run host hardening during install (default: true) */
  hardenOnInstall?: boolean;
  /** SSH port override — warn if set to 22 (default: 22) */
  sshPort?: number;
}

/**
 * Configuration for Docker container targets
 */
export interface DockerTargetConfig {
  /** Docker image name (default: "ghcr.io/clawdbot/clawdbot:latest") */
  imageName?: string;
  /** Name for the container */
  containerName: string;
  /** Local path to mount as config volume */
  configPath: string;
  /** Gateway port to expose */
  gatewayPort: number;
  /** Docker network to attach to */
  networkName?: string;
}

/**
 * Configuration for Kubernetes targets
 */
export interface KubernetesTargetConfig {
  /** Kubernetes namespace */
  namespace: string;
  /** Name for the Deployment resource */
  deploymentName: string;
  /** Container image (default: "ghcr.io/clawdbot/clawdbot:latest") */
  image?: string;
  /** Gateway port */
  gatewayPort: number;
  /** kubectl context to use */
  kubeContext?: string;
  /** Number of replicas (default: 1) */
  replicas?: number;
}

/**
 * Configuration for Cloudflare Workers deployment targets.
 *
 * Deploys a Moltbot gateway inside a Cloudflare Workers Sandbox container
 * with optional R2 state persistence.
 */
export interface CloudflareWorkersConfig {
  /** Cloudflare account ID */
  accountId: string;
  /** Worker name */
  workerName: string;
  /** R2 bucket name for state persistence */
  r2BucketName?: string;
  /** R2 access key ID */
  r2AccessKeyId?: string;
  /** R2 secret access key */
  r2SecretAccessKey?: string;
  /** Gateway auth token */
  gatewayToken: string;
  /** Gateway port (inside container) */
  gatewayPort: number;
  /** Cloudflare AI Gateway base URL (optional) */
  aiGatewayBaseUrl?: string;
  /** AI Gateway API key (optional) */
  aiGatewayApiKey?: string;
  /** Sandbox instance type (default: standard-4) */
  sandboxInstanceType?: string;
  /** Worker custom domain (optional) */
  customDomain?: string;
}

import type { EcsFargateConfig } from "../targets/ecs-fargate/ecs-fargate-config";
export type { EcsFargateConfig } from "../targets/ecs-fargate/ecs-fargate-config";

export type DeploymentTargetConfig =
  | { type: "local" }
  | { type: "remote-vm"; ssh: RemoteVMConfig }
  | { type: "docker"; docker: DockerTargetConfig }
  | { type: "kubernetes"; k8s: KubernetesTargetConfig }
  | { type: "ecs-fargate"; ecs: EcsFargateConfig }
  | { type: "cloudflare-workers"; cloudflare: CloudflareWorkersConfig };

// ── Utility types ──

/**
 * Detected operating system for local targets
 */
export type DetectedOS = "macos" | "linux" | "wsl2";

/**
 * Minimum port spacing between Moltbot instances.
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
