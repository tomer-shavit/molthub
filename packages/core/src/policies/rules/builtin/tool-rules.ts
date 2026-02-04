/**
 * Tool Policy Rules (OCP)
 *
 * Class-based rule evaluators for tool configuration and restrictions.
 * Self-register with the default registry on import.
 */

import { toolPatternRegistry } from "../../../tool-security";
import { defaultRegistry } from "../registry";
import { BasePolicyRuleEvaluator } from "../rule-interface";
import type { OpenClawConfig, OpenClawRuleResult } from "../../types";

/**
 * Ensures dangerous tools (password managers, credential stores) are not allowed.
 */
export class ForbidDangerousToolsRule extends BasePolicyRuleEvaluator {
  readonly ruleType = "forbid_dangerous_tools";
  readonly ruleName = "Forbid Dangerous Tools";
  readonly description = "Ensures dangerous tools (password managers, credential stores) are not allowed";

  evaluate(
    config: OpenClawConfig,
    ruleConfig: Record<string, unknown>,
  ): OpenClawRuleResult {
    if (!this.isEnabled(ruleConfig)) {
      return this.pass();
    }

    const allowList = config.tools?.allow;
    if (!allowList) {
      return this.pass();
    }

    // Get dangerous patterns from registry (supports custom providers)
    const dangerousPatterns = toolPatternRegistry.getAllDangerousPatterns();

    for (const tool of allowList) {
      for (const { pattern } of dangerousPatterns) {
        // Use registry's matching logic via isToolDenied for single pattern
        if (toolPatternRegistry.isToolDenied(tool, [pattern])) {
          return {
            passed: false,
            violation: {
              ruleId: "forbid_dangerous_tools",
              ruleName: this.ruleName,
              severity: "ERROR",
              message: (ruleConfig.message as string) || `Tool '${tool}' matches dangerous pattern '${pattern}'. Password managers and credential stores must not be in the allow list.`,
              field: "tools.allow",
              currentValue: tool,
            },
          };
        }
      }
    }

    return this.pass();
  }
}

/**
 * Ensures elevated tools have allowFrom restrictions configured.
 */
export class ForbidElevatedToolsRule extends BasePolicyRuleEvaluator {
  readonly ruleType = "forbid_elevated_tools";
  readonly ruleName = "Restrict Elevated Tools";
  readonly description = "Ensures elevated tools have allowFrom restrictions configured";

  evaluate(
    config: OpenClawConfig,
    ruleConfig: Record<string, unknown>,
  ): OpenClawRuleResult {
    if (!this.isEnabled(ruleConfig)) {
      return this.pass();
    }

    const elevated = config.tools?.elevated;
    if (elevated?.enabled && (!elevated.allowFrom || elevated.allowFrom.length === 0)) {
      return {
        passed: false,
        violation: {
          ruleId: "forbid_elevated_tools",
          ruleName: this.ruleName,
          severity: "WARNING",
          message: (ruleConfig.message as string) || "Elevated tools are enabled but no allowFrom restrictions are configured",
          field: "tools.elevated.allowFrom",
          currentValue: elevated.allowFrom,
        },
      };
    }

    return this.pass();
  }
}

/**
 * Ensures the tool profile is not set to a forbidden value (e.g., "full").
 */
export class LimitToolProfileRule extends BasePolicyRuleEvaluator {
  readonly ruleType = "limit_tool_profile";
  readonly ruleName = "Limit Tool Profile";
  readonly description = "Ensures the tool profile is not set to a forbidden value";

  evaluate(
    config: OpenClawConfig,
    ruleConfig: Record<string, unknown>,
  ): OpenClawRuleResult {
    const forbidden = (ruleConfig.forbiddenProfiles as string[]) || ["full"];
    const profile = config.tools?.profile;

    if (profile && forbidden.includes(profile)) {
      return {
        passed: false,
        violation: {
          ruleId: "limit_tool_profile",
          ruleName: this.ruleName,
          severity: "WARNING",
          message: (ruleConfig.message as string) || `Tool profile '${profile}' is not allowed. Forbidden profiles: ${forbidden.join(", ")}`,
          field: "tools.profile",
          currentValue: profile,
          suggestedValue: "standard",
        },
      };
    }

    return this.pass();
  }
}

// Self-register on import
defaultRegistry.register(new ForbidDangerousToolsRule());
defaultRegistry.register(new ForbidElevatedToolsRule());
defaultRegistry.register(new LimitToolProfileRule());
