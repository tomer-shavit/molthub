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
import { isSysboxAvailable, detectSysboxCapability, type ContainerRuntime } from "../sysbox";

/**
 * Security tier for deployment configuration.
 *
 * - development: Relaxed settings for local testing
 * - production: Maximum security for cloud deployments
 */
export type SecurityTier = "development" | "production";

/**
 * Sandbox configuration for OpenClaw agent isolation.
 *
 * SECURITY PRINCIPLE: Sandbox is the primary defense against prompt injection.
 * When enabled with network: none, even a successful injection cannot exfiltrate data.
 */
export interface SandboxConfig {
  /**
   * Sandbox mode:
   * - "off": No sandbox (only when Sysbox unavailable)
   * - "non-main": Only sub-agents run in sandbox
   * - "all": Every agent task runs in sandbox (REQUIRED for production)
   */
  mode: "off" | "non-main" | "all";
  /**
   * Sandbox scope:
   * - "session": Sandbox persists for entire session (recommended for workspace access)
   * - "agent": New sandbox per agent
   * - "shared": Shared sandbox across agents
   */
  scope?: "session" | "agent" | "shared";
  /**
   * Workspace access from within sandbox:
   * - "none": No access (most secure)
   * - "ro": Read-only access
   * - "rw": Read-write access (required for file operations)
   */
  workspaceAccess?: "none" | "ro" | "rw";
  /**
   * Docker configuration for sandbox containers.
   * These settings provide defense-in-depth hardening.
   */
  docker?: {
    /**
     * Docker network mode:
     * - "none": No network (CRITICAL - prevents exfiltration)
     * - "bridge": Default Docker network
     * - custom network name
     */
    network?: "none" | "bridge" | string;
    /**
     * Container runtime:
     * - "runc": Standard Docker runtime (default)
     * - "sysbox-runc": Sysbox runtime for secure Docker-in-Docker
     */
    runtime?: ContainerRuntime;
    /**
     * Memory limit for sandbox containers (e.g., "512m")
     */
    memory?: string;
    /**
     * CPU limit for sandbox containers (e.g., "1")
     */
    cpus?: string;
    /**
     * Mount root filesystem as read-only.
     * Prevents persistence of malicious payloads.
     */
    readOnlyRootfs?: boolean;
    /**
     * Prevent privilege escalation via setuid/setgid.
     */
    noNewPrivileges?: boolean;
    /**
     * Linux capabilities to drop (e.g., ["ALL"]).
     * Dropping ALL capabilities is recommended.
     */
    dropCapabilities?: string[];
  };
  /**
   * Reason why sandbox is unavailable (if mode is "off" due to missing capability).
   */
  unavailableReason?: string;
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
 * The "dream" sandbox configuration from docker-sandbox-architecture.md.
 * This is the security baseline we want for ALL deployments when Sysbox is available.
 *
 * Key security properties:
 * - network: none prevents data exfiltration even if prompt injection succeeds
 * - readOnlyRootfs prevents persistence of malicious payloads
 * - noNewPrivileges prevents privilege escalation
 * - dropCapabilities: ["ALL"] minimizes attack surface
 */
export function getDreamSandboxConfig(runtime: ContainerRuntime = "sysbox-runc"): SandboxConfig {
  return {
    mode: "all",
    scope: "session",
    workspaceAccess: "rw",
    docker: {
      network: "none",
      runtime,
      memory: "512m",
      cpus: "1",
      readOnlyRootfs: true,
      noNewPrivileges: true,
      dropCapabilities: ["ALL"],
    },
  };
}

/**
 * Get sandbox config when Sysbox is NOT YET available.
 *
 * IMPORTANT: This is a TEMPORARY state. The dream architecture requires
 * sandbox for ALL deployments. This config should only be used to indicate
 * that Sysbox installation is REQUIRED before deployment can proceed.
 *
 * The caller should check `requiresInstallation` and prompt the user to
 * run `clawster sysbox install` before allowing deployment.
 */
export function getSysboxRequiredConfig(reason: string): SandboxConfig {
  return {
    mode: "off",
    unavailableReason: `SYSBOX REQUIRED: ${reason}. Run: clawster sysbox install`,
  };
}

/**
 * Check if a sandbox config indicates Sysbox installation is required.
 */
export function isSysboxInstallationRequired(config: SandboxConfig): boolean {
  return config.mode === "off" && config.unavailableReason?.includes("SYSBOX REQUIRED") === true;
}

/**
 * Check if a deployment target is ready for secure deployment.
 *
 * DREAM ARCHITECTURE: Security is not optional. This function checks if
 * the target has Sysbox available (for Docker/Local) or will auto-install it (Cloud VMs).
 *
 * @returns Object with `ready` boolean and optional `action` describing what user must do
 */
export async function isTargetReadyForSecureDeployment(
  targetType: DeploymentTargetType
): Promise<{ ready: boolean; action?: string }> {
  // Cloud VMs auto-install Sysbox, always ready
  if (
    targetType === DeploymentTargetType.ECS_EC2 ||
    targetType === DeploymentTargetType.GCE ||
    targetType === DeploymentTargetType.AZURE_VM ||
    targetType === DeploymentTargetType.REMOTE_VM ||
    targetType === DeploymentTargetType.KUBERNETES ||
    targetType === DeploymentTargetType.CLOUDFLARE_WORKERS
  ) {
    return { ready: true };
  }

  // Docker/Local require Sysbox detection
  if (
    targetType === DeploymentTargetType.DOCKER ||
    targetType === DeploymentTargetType.LOCAL
  ) {
    const sandboxSupport = await targetSupportsSandboxAsync(targetType);
    if (sandboxSupport.supported) {
      return { ready: true };
    }
    return {
      ready: false,
      action: "Run: clawster sysbox install",
    };
  }

  return { ready: false, action: "Unknown deployment target" };
}

/**
 * Get the recommended security tier for a deployment target.
 *
 * NOTE: The tier affects logging level but NOT sandbox mode.
 * All targets should have sandbox enabled when Sysbox is available.
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
 *
 * NOTE: This is a synchronous check that cannot detect Sysbox availability.
 * For accurate detection with Sysbox support, use targetSupportsSandboxAsync().
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
    // NOTE: This is conservative; use async version for Sysbox detection
    case DeploymentTargetType.LOCAL:
    case DeploymentTargetType.DOCKER:
      return false;
    default:
      return false;
  }
}

/**
 * Async check if a deployment target supports Docker-in-Docker for sandbox mode.
 *
 * This version performs actual Sysbox detection for Docker targets.
 * Use this when you need accurate sandbox support detection.
 */
export async function targetSupportsSandboxAsync(
  targetType: DeploymentTargetType
): Promise<{ supported: boolean; reason?: string }> {
  switch (targetType) {
    // Cloud VMs mount Docker socket from host
    case DeploymentTargetType.ECS_EC2:
    case DeploymentTargetType.GCE:
    case DeploymentTargetType.AZURE_VM:
    case DeploymentTargetType.REMOTE_VM:
      return { supported: true };

    // Kubernetes can use sidecar Docker daemon or Sysbox RuntimeClass
    case DeploymentTargetType.KUBERNETES:
      return { supported: true, reason: "Depends on cluster configuration" };

    // Cloudflare Workers have their own sandbox mechanism
    case DeploymentTargetType.CLOUDFLARE_WORKERS:
      return { supported: true };

    // Local/Docker targets - check for Sysbox
    case DeploymentTargetType.LOCAL:
    case DeploymentTargetType.DOCKER: {
      const sysboxAvailable = await isSysboxAvailable();
      if (sysboxAvailable) {
        return { supported: true, reason: "Sysbox runtime detected" };
      }
      return {
        supported: false,
        reason: "Sysbox not installed. Run: clawster sysbox install",
      };
    }

    default:
      return { supported: false, reason: "Unknown deployment target" };
  }
}

/**
 * Get security configuration defaults for a specific deployment target.
 *
 * IMPORTANT: This is a synchronous version that cannot detect Sysbox.
 * For accurate sandbox configuration, use getSecurityDefaultsAsync().
 *
 * The dream architecture requires sandbox.mode: "all" for ALL targets.
 * This sync version returns the dream config for cloud targets (which auto-install Sysbox)
 * and falls back to sandbox.mode: "off" for Docker/Local (use async for Sysbox detection).
 */
export function getSecurityDefaults(targetType: DeploymentTargetType): SecurityConfig {
  const tier = getSecurityTierForTarget(targetType);

  // Base config that applies to all targets
  const baseGatewayConfig: GatewaySecurityConfig = {
    bind: targetType === DeploymentTargetType.LOCAL ? "loopback" : "lan",
    auth: { mode: "token" },
  };

  const baseChannelConfig: ChannelSecurityConfig = {
    dmPolicy: "pairing",
    groupPolicy: "allowlist",
  };

  const baseLoggingConfig: LoggingSecurityConfig = {
    level: tier === "development" ? "debug" : "info",
    redactSensitive: "tools",
  };

  // Target-specific sandbox configuration
  switch (targetType) {
    // Cloud VMs: Sysbox is auto-installed, use dream config
    case DeploymentTargetType.ECS_EC2:
    case DeploymentTargetType.GCE:
    case DeploymentTargetType.AZURE_VM:
    case DeploymentTargetType.REMOTE_VM:
      return {
        sandbox: getDreamSandboxConfig("sysbox-runc"),
        gateway: baseGatewayConfig,
        channels: baseChannelConfig,
        logging: baseLoggingConfig,
      };

    // Kubernetes: Use dream config with RuntimeClass
    case DeploymentTargetType.KUBERNETES:
      return {
        sandbox: getDreamSandboxConfig("sysbox-runc"),
        gateway: baseGatewayConfig,
        channels: baseChannelConfig,
        logging: baseLoggingConfig,
      };

    // Cloudflare Workers: Own isolation model, sandbox "all" but no docker config
    case DeploymentTargetType.CLOUDFLARE_WORKERS:
      return {
        sandbox: {
          mode: "all",
          scope: "session",
        },
        gateway: baseGatewayConfig,
        channels: baseChannelConfig,
        logging: baseLoggingConfig,
      };

    // Docker/Local: Sync version cannot detect Sysbox, so we return disabled sandbox
    // with a note to use the async version. This is the fallback path.
    case DeploymentTargetType.LOCAL:
      return {
        sandbox: getSysboxRequiredConfig(
          "Sysbox detection requires async. Use getSecurityDefaultsAsync() for accurate config."
        ),
        gateway: { bind: "loopback", auth: { mode: "token" } },
        channels: baseChannelConfig,
        logging: { level: "debug", redactSensitive: "tools" },
      };

    case DeploymentTargetType.DOCKER:
      return {
        sandbox: getSysboxRequiredConfig(
          "Sysbox detection requires async. Use getSecurityDefaultsAsync() for accurate config."
        ),
        gateway: baseGatewayConfig,
        channels: baseChannelConfig,
        logging: baseLoggingConfig,
      };

    default:
      // Unknown target: disable sandbox with explanation
      return {
        sandbox: getSysboxRequiredConfig("Unknown deployment target"),
        gateway: baseGatewayConfig,
        channels: baseChannelConfig,
        logging: baseLoggingConfig,
      };
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
 * Async version of applySecurityDefaults that performs Sysbox detection.
 *
 * This is the PREFERRED function for applying security defaults because it
 * uses async Sysbox detection to enable sandbox mode when available.
 *
 * @param config - User-provided OpenClaw configuration
 * @param targetType - Deployment target type
 * @param gatewayAuthToken - Generated gateway authentication token
 * @returns Configuration with security defaults applied (including sandbox when Sysbox available)
 */
export async function applySecurityDefaultsAsync(
  config: Record<string, unknown>,
  targetType: DeploymentTargetType,
  gatewayAuthToken: string
): Promise<Record<string, unknown>> {
  const securityDefaults = await getSecurityDefaultsAsync(targetType);
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
 * Async version that detects Sysbox availability for Docker/Local targets.
 *
 * This is the PREFERRED function for getting security defaults because it
 * performs actual Sysbox detection. The sync version is only for cases
 * where async is not possible.
 *
 * Dream Architecture: ALL targets get sandbox.mode: "all" when Sysbox is available.
 */
export async function getSecurityDefaultsAsync(
  targetType: DeploymentTargetType
): Promise<SecurityConfig> {
  const tier = getSecurityTierForTarget(targetType);
  const sandboxSupport = await targetSupportsSandboxAsync(targetType);

  const baseChannelConfig: ChannelSecurityConfig = {
    dmPolicy: "pairing",
    groupPolicy: "allowlist",
  };

  const baseLoggingConfig: LoggingSecurityConfig = {
    level: tier === "development" ? "debug" : "info",
    redactSensitive: "tools",
  };

  // Docker/Local targets: Use dream config when Sysbox is available
  if (
    targetType === DeploymentTargetType.DOCKER ||
    targetType === DeploymentTargetType.LOCAL
  ) {
    if (sandboxSupport.supported) {
      // Sysbox available - use full dream sandbox config
      return {
        sandbox: getDreamSandboxConfig("sysbox-runc"),
        gateway: {
          bind: targetType === DeploymentTargetType.LOCAL ? "loopback" : "lan",
          auth: { mode: "token" },
        },
        channels: baseChannelConfig,
        logging: baseLoggingConfig,
      };
    } else {
      // BLOCKING: Sysbox is REQUIRED for deployment.
      // The caller MUST check isSysboxInstallationRequired() and prompt the user
      // to run `clawster sysbox install` before allowing deployment.
      // Security is not optional - no deployment without sandbox.
      return {
        sandbox: getSysboxRequiredConfig(
          sandboxSupport.reason ?? "Sysbox not installed"
        ),
        gateway: {
          bind: targetType === DeploymentTargetType.LOCAL ? "loopback" : "lan",
          auth: { mode: "token" },
        },
        channels: baseChannelConfig,
        logging: baseLoggingConfig,
      };
    }
  }

  // Cloud VMs: Always use dream config (Sysbox auto-installed)
  if (
    targetType === DeploymentTargetType.ECS_EC2 ||
    targetType === DeploymentTargetType.GCE ||
    targetType === DeploymentTargetType.AZURE_VM ||
    targetType === DeploymentTargetType.REMOTE_VM
  ) {
    return {
      sandbox: getDreamSandboxConfig("sysbox-runc"),
      gateway: { bind: "lan", auth: { mode: "token" } },
      channels: baseChannelConfig,
      logging: baseLoggingConfig,
    };
  }

  // Kubernetes: Use dream config (requires RuntimeClass setup)
  if (targetType === DeploymentTargetType.KUBERNETES) {
    return {
      sandbox: getDreamSandboxConfig("sysbox-runc"),
      gateway: { bind: "lan", auth: { mode: "token" } },
      channels: baseChannelConfig,
      logging: baseLoggingConfig,
    };
  }

  // Cloudflare Workers: Own isolation, simplified sandbox
  if (targetType === DeploymentTargetType.CLOUDFLARE_WORKERS) {
    return {
      sandbox: { mode: "all", scope: "session" },
      gateway: { bind: "lan", auth: { mode: "token" } },
      channels: baseChannelConfig,
      logging: baseLoggingConfig,
    };
  }

  // Unknown target: Fall back to sync version
  return getSecurityDefaults(targetType);
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

  if (defaults.sandbox.docker?.runtime === "sysbox-runc") {
    lines.push(`Runtime: sysbox-runc (secure Docker-in-Docker)`);
  }

  lines.push(`DM Policy: ${defaults.channels.dmPolicy}`);
  lines.push(`Log Redaction: ${defaults.logging.redactSensitive}`);

  return lines.join("\n");
}

/**
 * Async version of security summary that includes Sysbox detection.
 * Shows the full dream architecture security posture.
 */
export async function getSecuritySummaryAsync(
  targetType: DeploymentTargetType
): Promise<string> {
  const defaults = await getSecurityDefaultsAsync(targetType);
  const tier = getSecurityTierForTarget(targetType);
  const sandboxSupport = await targetSupportsSandboxAsync(targetType);

  const lines = [
    `Security Tier: ${tier.toUpperCase()}`,
    `Sandbox Mode: ${defaults.sandbox.mode}${sandboxSupport.supported ? "" : ` (${sandboxSupport.reason})`}`,
  ];

  if (defaults.sandbox.mode === "all") {
    // Show dream architecture details
    if (defaults.sandbox.docker?.network === "none") {
      lines.push(`Network Isolation: ENABLED (blocks exfiltration)`);
    }
    if (defaults.sandbox.docker?.runtime === "sysbox-runc") {
      lines.push(`Runtime: sysbox-runc (secure Docker-in-Docker)`);
    }
    if (defaults.sandbox.docker?.readOnlyRootfs) {
      lines.push(`Read-Only Root: ENABLED (prevents persistence)`);
    }
    if (defaults.sandbox.docker?.noNewPrivileges) {
      lines.push(`No New Privileges: ENABLED (prevents escalation)`);
    }
    if (defaults.sandbox.docker?.dropCapabilities?.includes("ALL")) {
      lines.push(`Capabilities: ALL dropped (minimal attack surface)`);
    }
  }

  lines.push(`DM Policy: ${defaults.channels.dmPolicy}`);
  lines.push(`Log Redaction: ${defaults.logging.redactSensitive}`);

  return lines.join("\n");
}
