/**
 * Security Summary Module
 *
 * Provides human-readable summaries of security configurations.
 * Useful for displaying security posture to users in CLIs and dashboards.
 */

import { DeploymentTargetType } from "../interface/deployment-target";
import {
  getSecurityTierForTarget,
  targetSupportsSandbox,
  targetSupportsSandboxAsync,
} from "./security-defaults";
import {
  getSecurityDefaults,
  getSecurityDefaultsAsync,
} from "./security-applier";

/**
 * Get a human-readable summary of security settings for a deployment.
 *
 * IMPORTANT: This is a synchronous version that cannot detect Sysbox.
 * For accurate security summary including Sysbox status, use getSecuritySummaryAsync().
 *
 * @deprecated Use getSecuritySummaryAsync() for accurate Sysbox detection.
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
 *
 * This is the PREFERRED function for getting security summaries.
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
