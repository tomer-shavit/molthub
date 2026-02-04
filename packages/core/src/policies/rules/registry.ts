/**
 * Policy Rule Registry (OCP)
 *
 * Registry pattern for policy rule evaluators.
 * New rules can be registered without modifying the dispatcher.
 */

import type { OpenClawConfig, OpenClawEvaluationContext, OpenClawRuleResult } from "../types";
import type { IPolicyRuleEvaluator } from "./rule-interface";

/**
 * Registry for policy rule evaluators.
 * Rules self-register on import, and the dispatcher looks them up by type.
 */
export class PolicyRuleRegistry {
  private readonly evaluators = new Map<string, IPolicyRuleEvaluator>();

  /**
   * Register a rule evaluator.
   * Called during module initialization (self-registration pattern).
   *
   * @param evaluator - The rule evaluator to register
   * @throws Error if a rule with the same type is already registered
   */
  register(evaluator: IPolicyRuleEvaluator): void {
    if (this.evaluators.has(evaluator.ruleType)) {
      throw new Error(
        `Rule type '${evaluator.ruleType}' is already registered. ` +
        `Existing: ${this.evaluators.get(evaluator.ruleType)?.ruleName}`
      );
    }
    this.evaluators.set(evaluator.ruleType, evaluator);
  }

  /**
   * Get a registered evaluator by rule type.
   *
   * @param ruleType - The rule type identifier
   * @returns The evaluator or undefined if not found
   */
  get(ruleType: string): IPolicyRuleEvaluator | undefined {
    return this.evaluators.get(ruleType);
  }

  /**
   * Check if a rule type is registered.
   *
   * @param ruleType - The rule type identifier
   * @returns True if the rule type is registered
   */
  has(ruleType: string): boolean {
    return this.evaluators.has(ruleType);
  }

  /**
   * Evaluate a rule by type.
   *
   * By default, returns a passing result for unknown rule types (fail-open)
   * for backward compatibility with the original dispatcher behavior.
   * Use `strict: true` for fail-closed behavior in security-critical contexts.
   *
   * @param ruleType - The rule type identifier
   * @param config - The OpenClaw configuration to evaluate
   * @param ruleConfig - Rule-specific configuration options
   * @param context - Optional evaluation context
   * @param options - Evaluation options
   * @param options.strict - If true, unknown rules fail instead of pass (fail-closed)
   * @returns The evaluation result
   */
  evaluate(
    ruleType: string,
    config: OpenClawConfig,
    ruleConfig: Record<string, unknown>,
    context?: OpenClawEvaluationContext,
    options?: { strict?: boolean },
  ): OpenClawRuleResult {
    const evaluator = this.evaluators.get(ruleType);
    if (!evaluator) {
      // In strict mode, unknown rule types fail (fail-closed for security)
      if (options?.strict) {
        return {
          passed: false,
          violation: {
            ruleId: ruleType,
            ruleName: "Unknown Rule",
            severity: "ERROR",
            message: `Unknown rule type '${ruleType}'. Ensure the rule is registered.`,
            field: "policy.rules",
            currentValue: ruleType,
          },
        };
      }
      // Default: fail-open for backward compatibility
      return { passed: true };
    }
    return evaluator.evaluate(config, ruleConfig, context);
  }

  /**
   * Get all registered rule types.
   *
   * @returns Array of registered rule type identifiers
   */
  getRuleTypes(): string[] {
    return Array.from(this.evaluators.keys());
  }

  /**
   * Get all registered evaluators.
   *
   * @returns Array of all registered evaluators
   */
  getAllEvaluators(): IPolicyRuleEvaluator[] {
    return Array.from(this.evaluators.values());
  }

  /**
   * Clear all registered evaluators (mainly for testing).
   */
  clear(): void {
    this.evaluators.clear();
  }
}

/**
 * Default global registry instance.
 * Rules import this and self-register during module initialization.
 */
export const defaultRegistry = new PolicyRuleRegistry();
