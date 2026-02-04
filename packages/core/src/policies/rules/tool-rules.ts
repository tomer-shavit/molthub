/**
 * Tool-related policy rules
 *
 * Rules for validating OpenClaw tool configuration and restrictions.
 */

import { DANGEROUS_TOOL_PATTERNS } from "../../constants/tool-patterns";
import type { OpenClawConfig, OpenClawRuleResult } from "../types";

/**
 * Evaluates that dangerous tools (password managers, credential stores) are not allowed.
 */
export function evaluateForbidDangerousTools(
  config: OpenClawConfig,
  ruleConfig: { enabled?: boolean; message?: string },
): OpenClawRuleResult {
  if (ruleConfig.enabled === false) {
    return { passed: true };
  }

  const allowList = config.tools?.allow;
  if (!allowList) {
    return { passed: true };
  }

  for (const tool of allowList) {
    for (const pattern of DANGEROUS_TOOL_PATTERNS) {
      if (tool === pattern || (pattern.endsWith(":*") && tool.startsWith(pattern.slice(0, -1)))) {
        return {
          passed: false,
          violation: {
            ruleId: "forbid_dangerous_tools",
            ruleName: "Forbid Dangerous Tools",
            severity: "ERROR",
            message: ruleConfig.message || `Tool '${tool}' matches dangerous pattern '${pattern}'. Password managers and credential stores must not be in the allow list.`,
            field: "tools.allow",
            currentValue: tool,
          },
        };
      }
    }
  }

  return { passed: true };
}

/**
 * Evaluates that elevated tools have allowFrom restrictions configured.
 */
export function evaluateForbidElevatedTools(
  config: OpenClawConfig,
  ruleConfig: { enabled?: boolean; message?: string },
): OpenClawRuleResult {
  if (ruleConfig.enabled === false) {
    return { passed: true };
  }

  const elevated = config.tools?.elevated;
  if (elevated?.enabled && (!elevated.allowFrom || elevated.allowFrom.length === 0)) {
    return {
      passed: false,
      violation: {
        ruleId: "forbid_elevated_tools",
        ruleName: "Restrict Elevated Tools",
        severity: "WARNING",
        message: ruleConfig.message || "Elevated tools are enabled but no allowFrom restrictions are configured",
        field: "tools.elevated.allowFrom",
        currentValue: elevated.allowFrom,
      },
    };
  }

  return { passed: true };
}

/**
 * Evaluates that the tool profile is not set to a forbidden value (e.g., "full").
 */
export function evaluateLimitToolProfile(
  config: OpenClawConfig,
  ruleConfig: { forbiddenProfiles?: string[]; message?: string },
): OpenClawRuleResult {
  const forbidden = ruleConfig.forbiddenProfiles || ["full"];
  const profile = config.tools?.profile;

  if (profile && forbidden.includes(profile)) {
    return {
      passed: false,
      violation: {
        ruleId: "limit_tool_profile",
        ruleName: "Limit Tool Profile",
        severity: "WARNING",
        message: ruleConfig.message || `Tool profile '${profile}' is not allowed. Forbidden profiles: ${forbidden.join(", ")}`,
        field: "tools.profile",
        currentValue: profile,
        suggestedValue: "standard",
      },
    };
  }

  return { passed: true };
}
