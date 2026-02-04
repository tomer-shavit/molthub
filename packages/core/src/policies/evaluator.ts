/**
 * OpenClaw Policy Pack Evaluator
 *
 * Main function for evaluating policy packs against OpenClaw configs.
 */

import type { PolicyPack, PolicyViolation } from "../policy-pack";
import type { OpenClawConfig, OpenClawEvaluationContext, OpenClawPolicyEvaluationResult } from "./types";
import { evaluateOpenClawRule } from "./rules";

/**
 * Evaluates a policy pack against an OpenClaw configuration.
 *
 * @param pack - The policy pack to evaluate
 * @param instanceId - The ID of the instance being evaluated
 * @param config - The OpenClaw configuration to evaluate
 * @param context - Optional evaluation context with environment and other instances
 * @returns The evaluation result with violations and warnings
 */
export function evaluateOpenClawPolicyPack(
  pack: PolicyPack,
  instanceId: string,
  config: OpenClawConfig,
  context?: OpenClawEvaluationContext,
): OpenClawPolicyEvaluationResult {
  const violations: PolicyViolation[] = [];
  const warnings: PolicyViolation[] = [];

  for (const rule of pack.rules) {
    if (!rule.enabled) continue;

    // Check environment targeting
    if (rule.targetEnvironments && context?.environment) {
      if (!rule.targetEnvironments.includes(context.environment)) {
        continue;
      }
    }

    const result = evaluateOpenClawRule(rule.type, config, rule.config as Record<string, unknown>, context);

    if (!result.passed && result.violation) {
      const violation: PolicyViolation = {
        ...result.violation,
        ruleId: rule.id,
        ruleName: rule.name,
        severity: rule.severity,
      };

      if (rule.severity === "ERROR") {
        violations.push(violation);
      } else {
        warnings.push(violation);
      }
    }
  }

  return {
    packId: pack.id,
    packName: pack.name,
    instanceId,
    valid: violations.length === 0,
    violations,
    warnings,
    evaluatedAt: new Date(),
  };
}
