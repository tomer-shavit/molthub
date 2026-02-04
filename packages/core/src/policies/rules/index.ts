/**
 * OpenClaw Policy Rules
 *
 * Central dispatcher for rule evaluation using registry pattern (OCP).
 * Rules are self-registered on import, and the dispatcher looks them up by type.
 */

import type { OpenClawConfig, OpenClawEvaluationContext, OpenClawRuleResult } from "../types";

// Import built-in rules to trigger self-registration
import "./builtin";

// Re-export registry and interfaces for extensibility
export { defaultRegistry, PolicyRuleRegistry } from "./registry";
export type { IPolicyRuleEvaluator } from "./rule-interface";
export { BasePolicyRuleEvaluator } from "./rule-interface";

// Import the registry for the dispatcher
import { defaultRegistry } from "./registry";

/**
 * Main evaluation dispatcher that routes to the appropriate rule evaluator.
 * Uses the registry pattern - new rules can be added without modifying this function.
 *
 * @param ruleType - The rule type identifier (e.g., "require_gateway_auth")
 * @param config - The OpenClaw configuration to evaluate
 * @param ruleConfig - Rule-specific configuration options
 * @param context - Optional evaluation context for cross-instance checks
 * @returns The evaluation result with pass/fail and optional violation details
 */
export function evaluateOpenClawRule(
  ruleType: string,
  config: OpenClawConfig,
  ruleConfig: Record<string, unknown>,
  context?: OpenClawEvaluationContext,
): OpenClawRuleResult {
  return defaultRegistry.evaluate(ruleType, config, ruleConfig, context);
}
