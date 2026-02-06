/**
 * Security Defaults Module
 *
 * Contains security type definitions and tier/sandbox support helpers.
 * These are the foundational types and utilities used by security-applier
 * and security-summary modules.
 *
 * KEY SECURITY PRINCIPLES:
 * 1. Sandbox + network: none = prompt injection can't exfiltrate data
 * 2. Sysbox runtime = secure Docker-in-Docker without --privileged
 * 3. dmPolicy: pairing = approval codes for channel access
 * 4. Defense in depth = VPC isolation, security groups, encrypted storage
 */

import { DeploymentTargetType } from "../interface/deployment-target";
import {
  isSysboxAvailable,
  type ContainerRuntime,
} from "../sysbox";

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
     * CPU limit for sandbox containers (e.g., 1)
     */
    cpus?: number;
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
export function getDreamSandboxConfig(
  runtime: ContainerRuntime = "sysbox-runc"
): SandboxConfig {
  return {
    mode: "all",
    scope: "session",
    workspaceAccess: "rw",
    docker: {
      network: "none",
      runtime,
      memory: "512m",
      cpus: 1,
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
  return (
    config.mode === "off" &&
    config.unavailableReason?.includes("SYSBOX REQUIRED") === true
  );
}

/**
 * Get the recommended security tier for a deployment target.
 *
 * NOTE: The tier affects logging level but NOT sandbox mode.
 * All targets should have sandbox enabled when Sysbox is available.
 */
export function getSecurityTierForTarget(
  targetType: DeploymentTargetType
): SecurityTier {
  switch (targetType) {
    case DeploymentTargetType.LOCAL:
    case DeploymentTargetType.DOCKER:
      return "development";
    case DeploymentTargetType.ECS_EC2:
    case DeploymentTargetType.GCE:
    case DeploymentTargetType.AZURE_VM:
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
 *
 * @deprecated Use targetSupportsSandboxAsync() for accurate Sysbox detection.
 */
export function targetSupportsSandbox(
  targetType: DeploymentTargetType
): boolean {
  switch (targetType) {
    // Cloud VMs mount Docker socket from host
    case DeploymentTargetType.ECS_EC2:
    case DeploymentTargetType.GCE:
    case DeploymentTargetType.AZURE_VM:
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
 *
 * This is the PREFERRED function for checking sandbox support.
 */
export async function targetSupportsSandboxAsync(
  targetType: DeploymentTargetType
): Promise<{ supported: boolean; reason?: string }> {
  switch (targetType) {
    // Cloud VMs mount Docker socket from host
    case DeploymentTargetType.ECS_EC2:
    case DeploymentTargetType.GCE:
    case DeploymentTargetType.AZURE_VM:
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
    targetType === DeploymentTargetType.AZURE_VM
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
