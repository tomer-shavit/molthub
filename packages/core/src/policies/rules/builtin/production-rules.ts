/**
 * Production Policy Rules (OCP)
 *
 * Class-based rule evaluators for production environment requirements.
 * Self-register with the default registry on import.
 */

import { defaultRegistry } from "../registry";
import { BasePolicyRuleEvaluator } from "../rule-interface";
import type { OpenClawConfig, OpenClawRuleResult } from "../../types";

/**
 * Ensures model configuration meets production standards.
 */
export class RequireModelGuardrailsRule extends BasePolicyRuleEvaluator {
  readonly ruleType = "require_model_guardrails";
  readonly ruleName = "Require Model Guardrails";
  readonly description = "Ensures model configuration meets production standards";

  evaluate(
    config: OpenClawConfig,
    ruleConfig: Record<string, unknown>,
  ): OpenClawRuleResult {
    if (!this.isEnabled(ruleConfig)) {
      return this.pass();
    }

    const model = config.agents?.defaults?.model;

    if (ruleConfig.requireMaxTokens !== false && (!model || model.maxTokens === undefined)) {
      return {
        passed: false,
        violation: {
          ruleId: "require_model_guardrails",
          ruleName: this.ruleName,
          severity: "WARNING",
          message: (ruleConfig.message as string) || "Model maxTokens must be configured in production",
          field: "agents.defaults.model.maxTokens",
          currentValue: model?.maxTokens,
        },
      };
    }

    const maxTemp = (ruleConfig.maxTemperature as number) ?? 1.0;
    if (ruleConfig.requireTemperatureLimit !== false && model?.temperature !== undefined && model.temperature > maxTemp) {
      return {
        passed: false,
        violation: {
          ruleId: "require_model_guardrails",
          ruleName: this.ruleName,
          severity: "WARNING",
          message: (ruleConfig.message as string) || `Model temperature ${model.temperature} exceeds maximum ${maxTemp}`,
          field: "agents.defaults.model.temperature",
          currentValue: model.temperature,
          suggestedValue: maxTemp,
        },
      };
    }

    return this.pass();
  }
}

/**
 * Ensures token rotation is configured for production.
 */
export class RequireTokenRotationRule extends BasePolicyRuleEvaluator {
  readonly ruleType = "require_token_rotation";
  readonly ruleName = "Require Token Rotation Policy";
  readonly description = "Ensures token rotation is configured for production";

  evaluate(
    config: OpenClawConfig,
    ruleConfig: Record<string, unknown>,
  ): OpenClawRuleResult {
    if (!this.isEnabled(ruleConfig)) {
      return this.pass();
    }

    const tokenRotation = config.tokenRotation;

    // If token rotation is explicitly disabled, warn
    if (tokenRotation?.enabled === false) {
      return {
        passed: false,
        violation: {
          ruleId: "require_token_rotation",
          ruleName: this.ruleName,
          severity: "WARNING",
          message: (ruleConfig.message as string) || "Token rotation is explicitly disabled. Enable token rotation for production environments.",
          field: "tokenRotation.enabled",
          currentValue: false,
          suggestedValue: true,
        },
      };
    }

    return this.pass();
  }
}

/**
 * Ensures non-bundled skills have integrity hashes for verification.
 */
export class RequireSkillVerificationRule extends BasePolicyRuleEvaluator {
  readonly ruleType = "require_skill_verification";
  readonly ruleName = "Require Skill Verification";
  readonly description = "Ensures non-bundled skills have integrity hashes for verification";

  evaluate(
    config: OpenClawConfig,
    ruleConfig: Record<string, unknown>,
  ): OpenClawRuleResult {
    if (!this.isEnabled(ruleConfig)) {
      return this.pass();
    }

    const skills = config.skills;
    if (!skills?.entries) {
      return this.pass();
    }

    const allowUnverified = skills.allowUnverified === true;
    if (allowUnverified) {
      return this.pass();
    }

    for (const [skillId, entry] of Object.entries(skills.entries)) {
      const skill = entry as { source?: string; integrity?: { sha256?: string } };
      if (skill.source && skill.source !== "bundled") {
        if (!skill.integrity?.sha256) {
          return {
            passed: false,
            violation: {
              ruleId: "require_skill_verification",
              ruleName: this.ruleName,
              severity: "ERROR",
              message: (ruleConfig.message as string) || `Non-bundled skill '${skillId}' (source: ${skill.source}) must have integrity.sha256 for verification`,
              field: `skills.entries.${skillId}.integrity.sha256`,
              currentValue: undefined,
            },
          };
        }
      }
    }

    return this.pass();
  }
}

// Self-register on import
defaultRegistry.register(new RequireModelGuardrailsRule());
defaultRegistry.register(new RequireTokenRotationRule());
defaultRegistry.register(new RequireSkillVerificationRule());
