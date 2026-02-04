/**
 * Channel Policy Rules (OCP)
 *
 * Class-based rule evaluators for channel DM and group policies.
 * Self-register with the default registry on import.
 */

import { defaultRegistry } from "../registry";
import { BasePolicyRuleEvaluator } from "../rule-interface";
import type { OpenClawConfig, OpenClawRuleResult } from "../../types";

/**
 * Ensures DM policy is not set to a forbidden value (e.g., "open").
 */
export class RequireDmPolicyRule extends BasePolicyRuleEvaluator {
  readonly ruleType = "require_dm_policy";
  readonly ruleName = "Require DM Policy";
  readonly description = "Ensures DM policy is not set to a forbidden value";

  evaluate(
    config: OpenClawConfig,
    ruleConfig: Record<string, unknown>,
  ): OpenClawRuleResult {
    const forbidden = (ruleConfig.forbiddenValues as string[]) || ["open"];
    const allowed = ruleConfig.allowedValues as string[] | undefined;
    const channels = config.channels || [];

    for (const channel of channels) {
      const dmPolicy = channel.dmPolicy;
      if (!dmPolicy) continue;

      if (forbidden.includes(dmPolicy)) {
        return {
          passed: false,
          violation: {
            ruleId: "require_dm_policy",
            ruleName: this.ruleName,
            severity: "ERROR",
            message: (ruleConfig.message as string) || `DM policy '${dmPolicy}' is not allowed. Forbidden values: ${forbidden.join(", ")}`,
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
            ruleName: this.ruleName,
            severity: "ERROR",
            message: (ruleConfig.message as string) || `DM policy '${dmPolicy}' is not in allowed values: ${allowed.join(", ")}`,
            field: "channels.dmPolicy",
            currentValue: dmPolicy,
            suggestedValue: allowed[0],
          },
        };
      }
    }

    return this.pass();
  }
}

/**
 * Ensures group policy is not set to a forbidden value (e.g., "open").
 */
export class ForbidOpenGroupPolicyRule extends BasePolicyRuleEvaluator {
  readonly ruleType = "forbid_open_group_policy";
  readonly ruleName = "Forbid Open Group Policy";
  readonly description = "Ensures group policy is not set to a forbidden value";

  evaluate(
    config: OpenClawConfig,
    ruleConfig: Record<string, unknown>,
  ): OpenClawRuleResult {
    const forbidden = (ruleConfig.forbiddenValues as string[]) || ["open"];
    const channels = config.channels || [];

    for (const channel of channels) {
      const groupPolicy = channel.groupPolicy;
      if (!groupPolicy) continue;

      if (forbidden.includes(groupPolicy)) {
        return {
          passed: false,
          violation: {
            ruleId: "forbid_open_group_policy",
            ruleName: this.ruleName,
            severity: "ERROR",
            message: (ruleConfig.message as string) || `Group policy '${groupPolicy}' is not allowed. Forbidden values: ${forbidden.join(", ")}`,
            field: "channels.groupPolicy",
            currentValue: groupPolicy,
            suggestedValue: "allowlist",
          },
        };
      }
    }

    return this.pass();
  }
}

/**
 * Ensures all channels use allowlist or pairing-based access control.
 */
export class RequireChannelAllowlistRule extends BasePolicyRuleEvaluator {
  readonly ruleType = "require_channel_allowlist";
  readonly ruleName = "Require Channel Allowlist";
  readonly description = "Ensures all channels use allowlist or pairing-based access control";

  evaluate(
    config: OpenClawConfig,
    ruleConfig: Record<string, unknown>,
  ): OpenClawRuleResult {
    if (!this.isEnabled(ruleConfig)) {
      return this.pass();
    }

    const channels = config.channels || [];

    for (const channel of channels) {
      const name = channel.name || "unnamed";

      if (channel.dmPolicy === "open") {
        return {
          passed: false,
          violation: {
            ruleId: "require_channel_allowlist",
            ruleName: this.ruleName,
            severity: "ERROR",
            message: (ruleConfig.message as string) || `Channel '${name}' has open DM/group policy. Use 'allowlist' or 'pairing' instead.`,
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
            ruleName: this.ruleName,
            severity: "ERROR",
            message: (ruleConfig.message as string) || `Channel '${name}' has open DM/group policy. Use 'allowlist' or 'pairing' instead.`,
            field: "channels.groupPolicy",
            currentValue: channel.groupPolicy,
            suggestedValue: "allowlist",
          },
        };
      }
    }

    return this.pass();
  }
}

// Self-register on import
defaultRegistry.register(new RequireDmPolicyRule());
defaultRegistry.register(new ForbidOpenGroupPolicyRule());
defaultRegistry.register(new RequireChannelAllowlistRule());
