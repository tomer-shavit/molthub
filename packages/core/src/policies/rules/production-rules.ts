/**
 * Production-specific policy rules
 *
 * Rules for validating production environment requirements.
 */

import type { OpenClawConfig, OpenClawRuleResult } from "../types";

/**
 * Evaluates that model configuration meets production standards.
 */
export function evaluateRequireModelGuardrails(
  config: OpenClawConfig,
  ruleConfig: {
    enabled?: boolean;
    requireMaxTokens?: boolean;
    requireTemperatureLimit?: boolean;
    maxTemperature?: number;
    message?: string;
  },
): OpenClawRuleResult {
  if (ruleConfig.enabled === false) {
    return { passed: true };
  }

  const model = config.agents?.defaults?.model;

  if (ruleConfig.requireMaxTokens !== false && (!model || model.maxTokens === undefined)) {
    return {
      passed: false,
      violation: {
        ruleId: "require_model_guardrails",
        ruleName: "Require Model Guardrails",
        severity: "WARNING",
        message: ruleConfig.message || "Model maxTokens must be configured in production",
        field: "agents.defaults.model.maxTokens",
        currentValue: model?.maxTokens,
      },
    };
  }

  const maxTemp = ruleConfig.maxTemperature ?? 1.0;
  if (ruleConfig.requireTemperatureLimit !== false && model?.temperature !== undefined && model.temperature > maxTemp) {
    return {
      passed: false,
      violation: {
        ruleId: "require_model_guardrails",
        ruleName: "Require Model Guardrails",
        severity: "WARNING",
        message: ruleConfig.message || `Model temperature ${model.temperature} exceeds maximum ${maxTemp}`,
        field: "agents.defaults.model.temperature",
        currentValue: model.temperature,
        suggestedValue: maxTemp,
      },
    };
  }

  return { passed: true };
}

/**
 * Evaluates that token rotation is configured for production.
 */
export function evaluateRequireTokenRotation(
  config: OpenClawConfig,
  ruleConfig: { enabled?: boolean; maxAgeDays?: number; message?: string },
): OpenClawRuleResult {
  if (ruleConfig.enabled === false) {
    return { passed: true };
  }

  const tokenRotation = config.tokenRotation;

  // If token rotation is explicitly disabled, warn
  if (tokenRotation?.enabled === false) {
    return {
      passed: false,
      violation: {
        ruleId: "require_token_rotation",
        ruleName: "Require Token Rotation Policy",
        severity: "WARNING",
        message: ruleConfig.message || "Token rotation is explicitly disabled. Enable token rotation for production environments.",
        field: "tokenRotation.enabled",
        currentValue: false,
        suggestedValue: true,
      },
    };
  }

  return { passed: true };
}

/**
 * Evaluates that non-bundled skills have integrity hashes for verification.
 */
export function evaluateRequireSkillVerification(
  config: OpenClawConfig,
  ruleConfig: { enabled?: boolean; message?: string },
): OpenClawRuleResult {
  if (ruleConfig.enabled === false) {
    return { passed: true };
  }

  const skills = config.skills;
  if (!skills?.entries) {
    return { passed: true };
  }

  const allowUnverified = skills.allowUnverified === true;
  if (allowUnverified) {
    return { passed: true };
  }

  for (const [skillId, entry] of Object.entries(skills.entries)) {
    const skill = entry as { source?: string; integrity?: { sha256?: string } };
    if (skill.source && skill.source !== "bundled") {
      if (!skill.integrity?.sha256) {
        return {
          passed: false,
          violation: {
            ruleId: "require_skill_verification",
            ruleName: "Require Skill Verification",
            severity: "ERROR",
            message: ruleConfig.message || `Non-bundled skill '${skillId}' (source: ${skill.source}) must have integrity.sha256 for verification`,
            field: `skills.entries.${skillId}.integrity.sha256`,
            currentValue: undefined,
          },
        };
      }
    }
  }

  return { passed: true };
}
