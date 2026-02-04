/**
 * Gateway-related policy rules
 *
 * Rules for validating OpenClaw Gateway configuration.
 */

import type { OpenClawConfig, OpenClawRuleResult } from "../types";

/**
 * Evaluates that the Gateway has token or password authentication configured.
 */
export function evaluateRequireGatewayAuth(
  config: OpenClawConfig,
  ruleConfig: { enabled?: boolean; message?: string },
): OpenClawRuleResult {
  if (ruleConfig.enabled === false) {
    return { passed: true };
  }

  const hasToken = !!config.gateway?.auth?.token;
  const hasPassword = !!config.gateway?.auth?.password;

  if (!hasToken && !hasPassword) {
    return {
      passed: false,
      violation: {
        ruleId: "require_gateway_auth",
        ruleName: "Require Gateway Authentication",
        severity: "ERROR",
        message: ruleConfig.message || "Gateway must have token or password authentication configured",
        field: "gateway.auth",
        currentValue: config.gateway?.auth,
      },
    };
  }

  return { passed: true };
}

/**
 * Evaluates that the Gateway does not bind to 0.0.0.0 (all interfaces).
 */
export function evaluateRequireGatewayHostBinding(
  config: OpenClawConfig,
  ruleConfig: { enabled?: boolean; message?: string },
): OpenClawRuleResult {
  if (ruleConfig.enabled === false) {
    return { passed: true };
  }

  if (config.gateway?.host === "0.0.0.0") {
    return {
      passed: false,
      violation: {
        ruleId: "require_gateway_host_binding",
        ruleName: "Require Gateway Host Binding",
        severity: "ERROR",
        message: ruleConfig.message || "Gateway must not bind to 0.0.0.0 — use 127.0.0.1 or a specific interface",
        field: "gateway.host",
        currentValue: config.gateway.host,
        suggestedValue: "127.0.0.1",
      },
    };
  }

  return { passed: true };
}
