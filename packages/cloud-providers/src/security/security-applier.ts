/**
 * Security Applier Module
 *
 * Provides functions to get security defaults and apply them to OpenClaw
 * configurations. Offers both sync and async versions, with async being
 * the preferred approach for accurate Sysbox detection.
 *
 * ASYNC-FIRST DESIGN:
 * - getSecurityDefaultsAsync() and applySecurityDefaultsAsync() are PREFERRED
 * - They perform actual Sysbox detection for Docker/Local targets
 * - Sync versions exist only for legacy compatibility or contexts where async is impossible
 * - Sync versions for Docker/Local targets return "Sysbox required" status
 */

import { DeploymentTargetType } from "../interface/deployment-target";
import {
  type SecurityConfig,
  type GatewaySecurityConfig,
  type ChannelSecurityConfig,
  type LoggingSecurityConfig,
  getSecurityTierForTarget,
  getDreamSandboxConfig,
  getSysboxRequiredConfig,
  targetSupportsSandboxAsync,
} from "./security-defaults";

/**
 * Get security configuration defaults for a specific deployment target.
 *
 * IMPORTANT: This is a synchronous version that cannot detect Sysbox.
 * For accurate sandbox configuration, use getSecurityDefaultsAsync().
 *
 * The dream architecture requires sandbox.mode: "all" for ALL targets.
 * This sync version returns the dream config for cloud targets (which auto-install Sysbox)
 * and falls back to sandbox.mode: "off" for Docker/Local (use async for Sysbox detection).
 *
 * @deprecated Use getSecurityDefaultsAsync() for accurate Sysbox detection.
 */
export function getSecurityDefaults(
  targetType: DeploymentTargetType
): SecurityConfig {
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
 * Apply security defaults to an OpenClaw configuration object.
 *
 * This function merges security defaults with user-provided config,
 * ensuring security settings are present without overwriting explicit choices.
 *
 * IMPORTANT: This is a synchronous version that cannot detect Sysbox.
 * For accurate sandbox configuration, use applySecurityDefaultsAsync().
 *
 * @param config - User-provided OpenClaw configuration
 * @param targetType - Deployment target type
 * @param gatewayAuthToken - Generated gateway authentication token
 * @returns Configuration with security defaults applied
 *
 * @deprecated Use applySecurityDefaultsAsync() for accurate Sysbox detection.
 */
export function applySecurityDefaults(
  config: Record<string, unknown>,
  targetType: DeploymentTargetType,
  gatewayAuthToken: string
): Record<string, unknown> {
  const securityDefaults = getSecurityDefaults(targetType);
  return applySecurityConfigToOpenClawConfig(
    config,
    securityDefaults,
    gatewayAuthToken
  );
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
  return applySecurityConfigToOpenClawConfig(
    config,
    securityDefaults,
    gatewayAuthToken
  );
}

/**
 * Internal helper that applies a SecurityConfig to an OpenClaw configuration.
 * Shared by both sync and async versions.
 */
function applySecurityConfigToOpenClawConfig(
  config: Record<string, unknown>,
  securityDefaults: SecurityConfig,
  gatewayAuthToken: string
): Record<string, unknown> {
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
  for (const [, channelConfig] of Object.entries(channels)) {
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
