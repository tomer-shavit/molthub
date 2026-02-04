/**
 * Policy Rule Interface (OCP)
 *
 * Defines the contract for policy rule evaluators following
 * the Open/Closed Principle - open for extension, closed for modification.
 */

import type { OpenClawConfig, OpenClawEvaluationContext, OpenClawRuleResult } from "../types";

/**
 * Interface that all policy rule evaluators must implement.
 * New rules can be added without modifying the dispatcher.
 */
export interface IPolicyRuleEvaluator {
  /** Unique identifier for this rule type (used in switch dispatch) */
  readonly ruleType: string;

  /** Human-readable name for display */
  readonly ruleName: string;

  /** Description of what this rule checks */
  readonly description: string;

  /**
   * Evaluate the rule against an OpenClaw configuration.
   *
   * @param config - The OpenClaw configuration to evaluate
   * @param ruleConfig - Rule-specific configuration options
   * @param context - Optional evaluation context for cross-instance checks
   * @returns The evaluation result with pass/fail and optional violation details
   */
  evaluate(
    config: OpenClawConfig,
    ruleConfig: Record<string, unknown>,
    context?: OpenClawEvaluationContext,
  ): OpenClawRuleResult;
}

/**
 * Base class for rule evaluators with common utility methods.
 * Extend this class for easier rule implementation.
 */
export abstract class BasePolicyRuleEvaluator implements IPolicyRuleEvaluator {
  abstract readonly ruleType: string;
  abstract readonly ruleName: string;
  abstract readonly description: string;

  abstract evaluate(
    config: OpenClawConfig,
    ruleConfig: Record<string, unknown>,
    context?: OpenClawEvaluationContext,
  ): OpenClawRuleResult;

  /**
   * Helper to check if the rule is enabled (default: true).
   */
  protected isEnabled(ruleConfig: Record<string, unknown>): boolean {
    return ruleConfig.enabled !== false;
  }

  /**
   * Helper to create a passing result.
   */
  protected pass(): OpenClawRuleResult {
    return { passed: true };
  }
}
