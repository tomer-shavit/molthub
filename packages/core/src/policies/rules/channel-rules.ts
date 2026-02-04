/**
 * Channel-related policy rules
 *
 * Rules for validating OpenClaw channel DM and group policies.
 */

import type { OpenClawConfig, OpenClawRuleResult } from "../types";

/**
 * Evaluates that DM policy is not set to a forbidden value (e.g., "open").
 */
export function evaluateRequireDmPolicy(
  config: OpenClawConfig,
  ruleConfig: { forbiddenValues?: string[]; allowedValues?: string[]; message?: string },
): OpenClawRuleResult {
  const forbidden = ruleConfig.forbiddenValues || ["open"];
  const allowed = ruleConfig.allowedValues;
  const channels = config.channels || [];

  for (const channel of channels) {
    const dmPolicy = channel.dmPolicy;
    if (!dmPolicy) continue;

    if (forbidden.includes(dmPolicy)) {
      return {
        passed: false,
        violation: {
          ruleId: "require_dm_policy",
          ruleName: "Require DM Policy",
          severity: "ERROR",
          message: ruleConfig.message || `DM policy '${dmPolicy}' is not allowed. Forbidden values: ${forbidden.join(", ")}`,
          field: "channels.dmPolicy",
          currentValue: dmPolicy,
          suggestedValue: allowed ? allowed[0] : "pairing",
        },
      };
    }

    if (allowed && !allowed.includes(dmPolicy)) {
      return {
        passed: false,
        violation: {
          ruleId: "require_dm_policy",
          ruleName: "Require DM Policy",
          severity: "ERROR",
          message: ruleConfig.message || `DM policy '${dmPolicy}' is not in allowed values: ${allowed.join(", ")}`,
          field: "channels.dmPolicy",
          currentValue: dmPolicy,
          suggestedValue: allowed[0],
        },
      };
    }
  }

  return { passed: true };
}

/**
 * Evaluates that group policy is not set to a forbidden value (e.g., "open").
 */
export function evaluateForbidOpenGroupPolicy(
  config: OpenClawConfig,
  ruleConfig: { forbiddenValues?: string[]; message?: string },
): OpenClawRuleResult {
  const forbidden = ruleConfig.forbiddenValues || ["open"];
  const channels = config.channels || [];

  for (const channel of channels) {
    const groupPolicy = channel.groupPolicy;
    if (!groupPolicy) continue;

    if (forbidden.includes(groupPolicy)) {
      return {
        passed: false,
        violation: {
          ruleId: "forbid_open_group_policy",
          ruleName: "Forbid Open Group Policy",
          severity: "ERROR",
          message: ruleConfig.message || `Group policy '${groupPolicy}' is not allowed. Forbidden values: ${forbidden.join(", ")}`,
          field: "channels.groupPolicy",
          currentValue: groupPolicy,
          suggestedValue: "allowlist",
        },
      };
    }
  }

  return { passed: true };
}

/**
 * Evaluates that all channels use allowlist or pairing-based access control.
 */
export function evaluateRequireChannelAllowlist(
  config: OpenClawConfig,
  ruleConfig: { enabled?: boolean; message?: string },
): OpenClawRuleResult {
  if (ruleConfig.enabled === false) {
    return { passed: true };
  }

  const channels = config.channels || [];

  for (const channel of channels) {
    const name = channel.name || "unnamed";

    if (channel.dmPolicy === "open") {
      return {
        passed: false,
        violation: {
          ruleId: "require_channel_allowlist",
          ruleName: "Require Channel Allowlist",
          severity: "ERROR",
          message: ruleConfig.message || `Channel '${name}' has open DM/group policy. Use 'allowlist' or 'pairing' instead.`,
          field: "channels.dmPolicy",
          currentValue: channel.dmPolicy,
          suggestedValue: "allowlist",
        },
      };
    }

    if (channel.groupPolicy === "open") {
      return {
        passed: false,
        violation: {
          ruleId: "require_channel_allowlist",
          ruleName: "Require Channel Allowlist",
          severity: "ERROR",
          message: ruleConfig.message || `Channel '${name}' has open DM/group policy. Use 'allowlist' or 'pairing' instead.`,
          field: "channels.groupPolicy",
          currentValue: channel.groupPolicy,
          suggestedValue: "allowlist",
        },
      };
    }
  }

  return { passed: true };
}
