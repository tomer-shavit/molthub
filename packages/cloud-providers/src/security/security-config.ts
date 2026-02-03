/**
 * Security Configuration Module for Clawster Deployments
 *
 * Defines security defaults and best practices for OpenClaw deployments
 * across different deployment targets. Based on the security architecture
 * documented in CLAUDE.md.
 *
 * KEY SECURITY PRINCIPLES:
 * 1. Sandbox + network: none = prompt injection can't exfiltrate data
 * 2. Cloud VMs with Docker socket = enable sandbox mode
 * 3. Local Docker = sandbox off (no Docker-in-Docker without Sysbox)
 * 4. dmPolicy: pairing = approval codes for channel access
 * 5. Defense in depth = VPC isolation, security groups, encrypted storage
 */

import { DeploymentTargetType } from "../interface/deployment-target";

/**
 * Security tier for deployment configuration.
 *
 * - development: Relaxed settings for local testing
 * - production: Maximum security for cloud deployments
 */
export type SecurityTier = "development" | "production";

/**
 * Sandbox configuration for OpenClaw agent isolation.
 */
export interface SandboxConfig {
  /**
   * Sandbox mode:
   * - "off": No sandbox (required for local Docker without Sysbox)
   * - "non-main": Only sub-agents run in sandbox
   * - "all": Every agent task runs in sandbox (recommended for production)
   */
  mode: "off" | "non-main" | "all";
  /**
   * Sandbox scope:
   * - "session": Sandbox persists for entire session
   * - "agent": New sandbox per agent (default, recommended)
   * - "shared": Shared sandbox across agents
   */
  scope?: "session" | "agent" | "shared";
  /**
   * Workspace access from within sandbox:
   * - "none": No access (most secure)
   * - "ro": Read-only access
   * - "rw": Read-write access
   */
  workspaceAccess?: "none" | "ro" | "rw";
  /**
   * Docker configuration for sandbox containers.
   */
  docker?: {
    /**
     * Docker network mode:
     * - "none": No network (prevents exfiltration - RECOMMENDED)
     * - "bridge": Default Docker network
     * - custom network name
     */
    network?: "none" | "bridge" | string;
    /**
     * Memory limit for sandbox containers (e.g., "512m")
     */
    memory?: string;
    /**
     * CPU limit for sandbox containers (e.g., "1")
     */
    cpus?: string;
  };
}

/**
 * Gateway security configuration.
 */
export interface GatewaySecurityConfig {
  /**
   * Gateway bind mode:
   * - "loopback": Only localhost (127.0.0.1)
   * - "lan": All interfaces (0.0.0.0) - required for containers
   */
  bind: "loopback" | "lan";
  /**
   * Authentication configuration.
   */
  auth: {
    /**
     * Auth mode:
     * - "token": Bearer token authentication (recommended)
     * - "password": Password-based authentication
     */
    mode: "token" | "password";
    /**
     * Auth token (required for token mode).
     * Should be a cryptographically secure random string.
     */
    token?: string;
  };
}

/**
 * Channel security configuration.
 */
export interface ChannelSecurityConfig {
  /**
   * DM access policy:
   * - "pairing": Unknown senders get approval codes (DEFAULT - recommended)
   * - "allowlist": Only pre-approved senders allowed
   * - "open": Anyone can send DMs (dangerous - requires explicit "*")
   * - "disabled": Ignore all DMs
   */
  dmPolicy: "pairing" | "allowlist" | "open" | "disabled";
  /**
   * Group access policy:
   * - "allowlist": Only pre-approved groups (default)
   * - "open": Any group can interact
   * - "disabled": Ignore group messages
   */
  groupPolicy?: "allowlist" | "open" | "disabled";
}

/**
 * Logging security configuration.
 */
export interface LoggingSecurityConfig {
  /**
   * Log level threshold.
   */
  level?: "debug" | "info" | "warn" | "error";
  /**
   * Sensitive data redaction:
   * - "off": No redaction (dangerous)
   * - "tools": Redact tool outputs (recommended)
   */
  redactSensitive: "off" | "tools";
}

/**
 * Complete security configuration for a deployment.
 */
export interface SecurityConfig {
  sandbox: SandboxConfig;
  gateway: GatewaySecurityConfig;
  channels: ChannelSecurityConfig;
  logging: LoggingSecurityConfig;
}

/**
 * Get the recommended security tier for a deployment target.
 *
 * - Local/Docker: development (no DinD, relaxed settings)
 * - Cloud VMs (AWS/GCE/Azure): production (full sandbox, strict security)
 */
export function getSecurityTierForTarget(targetType: DeploymentTargetType): SecurityTier {
  switch (targetType) {
    case DeploymentTargetType.LOCAL:
    case DeploymentTargetType.DOCKER:
      return "development";
    case DeploymentTargetType.ECS_EC2:
    case DeploymentTargetType.GCE:
    case DeploymentTargetType.AZURE_VM:
    case DeploymentTargetType.KUBERNETES:
    case DeploymentTargetType.CLOUDFLARE_WORKERS:
    case DeploymentTargetType.REMOTE_VM:
      return "production";
    default:
      return "development";
  }
}

/**
 * Check if a deployment target supports Docker-in-Docker for sandbox mode.
 *
 * Docker-in-Docker requires either:
 * - Docker socket mounting (cloud VMs mount /var/run/docker.sock)
 * - Sysbox runtime (true VM-like isolation)
 * - Privileged mode (insecure - not recommended)
 *
 * Standard Docker containers cannot spawn nested containers.
 */
export function targetSupportsSandbox(targetType: DeploymentTargetType): boolean {
  switch (targetType) {
    // Cloud VMs mount Docker socket from host
    case DeploymentTargetType.ECS_EC2:
    case DeploymentTargetType.GCE:
    case DeploymentTargetType.AZURE_VM:
    case DeploymentTargetType.REMOTE_VM:
      return true;
    // Kubernetes can use sidecar Docker daemon or privileged pods
    case DeploymentTargetType.KUBERNETES:
      return true; // Depends on cluster config, assume yes
    // Cloudflare Workers have their own sandbox mechanism
    case DeploymentTargetType.CLOUDFLARE_WORKERS:
      return true;
    // Local development with Docker - no DinD without Sysbox
    case DeploymentTargetType.LOCAL:
    case DeploymentTargetType.DOCKER:
      return false;
    default:
      return false;
  }
}

/**
 * Get security configuration defaults for a specific deployment target.
 */
export function getSecurityDefaults(targetType: DeploymentTargetType): SecurityConfig {
  const tier = getSecurityTierForTarget(targetType);
  const supportsSandbox = targetSupportsSandbox(targetType);

  // Base configuration
  const baseConfig: SecurityConfig = {
    sandbox: {
      mode: supportsSandbox ? "all" : "off",
      scope: "agent",
      workspaceAccess: "none",
      docker: supportsSandbox
        ? {
            // CRITICAL: network: none prevents prompt injection exfiltration
            network: "none",
          }
        : undefined,
    },
    gateway: {
      // Containers must bind to 0.0.0.0; local can use loopback
      bind: targetType === DeploymentTargetType.LOCAL ? "loopback" : "lan",
      auth: {
        mode: "token",
        // Token should be generated by caller
      },
    },
    channels: {
      // Pairing is the secure default - unknown senders get approval codes
      dmPolicy: "pairing",
      groupPolicy: "allowlist",
    },
    logging: {
      level: tier === "development" ? "debug" : "info",
      // Always redact tool outputs to prevent sensitive data in logs
      redactSensitive: "tools",
    },
  };

  // Target-specific overrides
  switch (targetType) {
    case DeploymentTargetType.LOCAL:
      // Local development: relaxed for testing
      return {
        ...baseConfig,
        sandbox: { mode: "off" },
        gateway: { bind: "loopback", auth: { mode: "token" } },
        logging: { level: "debug", redactSensitive: "tools" },
      };

    case DeploymentTargetType.DOCKER:
      // Docker without Sysbox: sandbox disabled
      return {
        ...baseConfig,
        sandbox: { mode: "off" },
        gateway: { bind: "lan", auth: { mode: "token" } },
      };

    case DeploymentTargetType.ECS_EC2:
    case DeploymentTargetType.GCE:
    case DeploymentTargetType.AZURE_VM:
      // Cloud VMs: full sandbox with network isolation
      return {
        ...baseConfig,
        sandbox: {
          mode: "all",
          scope: "agent",
          workspaceAccess: "none",
          docker: {
            network: "none", // CRITICAL for prompt injection protection
          },
        },
      };

    case DeploymentTargetType.KUBERNETES:
      // Kubernetes: depends on cluster config
      return {
        ...baseConfig,
        sandbox: {
          mode: "non-main", // Conservative default for K8s
          scope: "agent",
        },
      };

    case DeploymentTargetType.CLOUDFLARE_WORKERS:
      // Cloudflare has its own isolation model
      return {
        ...baseConfig,
        sandbox: {
          mode: "all",
          scope: "agent",
        },
      };

    case DeploymentTargetType.REMOTE_VM:
      // Remote VM: depends on setup, default to full sandbox
      return {
        ...baseConfig,
        sandbox: {
          mode: "all",
          scope: "agent",
          workspaceAccess: "none",
          docker: { network: "none" },
        },
      };

    default:
      return baseConfig;
  }
}

/**
 * Apply security defaults to an OpenClaw configuration object.
 *
 * This function merges security defaults with user-provided config,
 * ensuring security settings are present without overwriting explicit choices.
 *
 * @param config - User-provided OpenClaw configuration
 * @param targetType - Deployment target type
 * @param gatewayAuthToken - Generated gateway authentication token
 * @returns Configuration with security defaults applied
 */
export function applySecurityDefaults(
  config: Record<string, unknown>,
  targetType: DeploymentTargetType,
  gatewayAuthToken: string
): Record<string, unknown> {
  const securityDefaults = getSecurityDefaults(targetType);
  const result = { ...config };

  // Apply gateway security
  if (!result.gateway) result.gateway = {};
  const gateway = result.gateway as Record<string, unknown>;

  if (!gateway.bind) {
    gateway.bind = securityDefaults.gateway.bind;
  }
  if (!gateway.auth) {
    gateway.auth = {
      mode: securityDefaults.gateway.auth.mode,
      token: gatewayAuthToken,
    };
  }

  // Apply sandbox configuration to agents.defaults
  if (!result.agents) result.agents = {};
  const agents = result.agents as Record<string, unknown>;
  if (!agents.defaults) agents.defaults = {};
  const defaults = agents.defaults as Record<string, unknown>;

  if (!defaults.sandbox) {
    defaults.sandbox = securityDefaults.sandbox;
  }

  // Apply channel security defaults
  if (!result.channels) result.channels = {};
  const channels = result.channels as Record<string, unknown>;

  // Set default dmPolicy and groupPolicy for any defined channels
  for (const [channelName, channelConfig] of Object.entries(channels)) {
    if (channelConfig && typeof channelConfig === "object") {
      const ch = channelConfig as Record<string, unknown>;
      if (!ch.dmPolicy) {
        ch.dmPolicy = securityDefaults.channels.dmPolicy;
      }
      if (!ch.groupPolicy) {
        ch.groupPolicy = securityDefaults.channels.groupPolicy;
      }
    }
  }

  // Apply logging security
  if (!result.logging) result.logging = {};
  const logging = result.logging as Record<string, unknown>;

  if (!logging.redactSensitive) {
    logging.redactSensitive = securityDefaults.logging.redactSensitive;
  }
  if (!logging.level) {
    logging.level = securityDefaults.logging.level;
  }

  return result;
}

/**
 * Get a human-readable summary of security settings for a deployment.
 */
export function getSecuritySummary(targetType: DeploymentTargetType): string {
  const defaults = getSecurityDefaults(targetType);
  const tier = getSecurityTierForTarget(targetType);
  const sandboxSupported = targetSupportsSandbox(targetType);

  const lines = [
    `Security Tier: ${tier.toUpperCase()}`,
    `Sandbox Mode: ${defaults.sandbox.mode}${sandboxSupported ? "" : " (Docker-in-Docker unavailable)"}`,
  ];

  if (defaults.sandbox.docker?.network === "none") {
    lines.push(`Network Isolation: ENABLED (blocks exfiltration)`);
  }

  lines.push(`DM Policy: ${defaults.channels.dmPolicy}`);
  lines.push(`Log Redaction: ${defaults.logging.redactSensitive}`);

  return lines.join("\n");
}
