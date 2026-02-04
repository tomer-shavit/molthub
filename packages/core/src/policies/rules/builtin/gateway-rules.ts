/**
 * Gateway Policy Rules (OCP)
 *
 * Class-based rule evaluators for Gateway configuration.
 * Self-register with the default registry on import.
 */

import { defaultRegistry } from "../registry";
import { BasePolicyRuleEvaluator } from "../rule-interface";
import type { OpenClawConfig, OpenClawRuleResult } from "../../types";

/**
 * Ensures Gateway has token or password authentication configured.
 */
export class RequireGatewayAuthRule extends BasePolicyRuleEvaluator {
  readonly ruleType = "require_gateway_auth";
  readonly ruleName = "Require Gateway Authentication";
  readonly description = "Ensures Gateway has token or password authentication configured";

  evaluate(
    config: OpenClawConfig,
    ruleConfig: Record<string, unknown>,
  ): OpenClawRuleResult {
    if (!this.isEnabled(ruleConfig)) {
      return this.pass();
    }

    const hasToken = !!config.gateway?.auth?.token;
    const hasPassword = !!config.gateway?.auth?.password;

    if (!hasToken && !hasPassword) {
      return {
        passed: false,
        violation: {
          ruleId: "require_gateway_auth",
          ruleName: this.ruleName,
          severity: "ERROR",
          message: (ruleConfig.message as string) || "Gateway must have token or password authentication configured",
          field: "gateway.auth",
          currentValue: config.gateway?.auth,
        },
      };
    }

    return this.pass();
  }
}

/**
 * Ensures Gateway does not bind to 0.0.0.0 (all interfaces).
 */
export class RequireGatewayHostBindingRule extends BasePolicyRuleEvaluator {
  readonly ruleType = "require_gateway_host_binding";
  readonly ruleName = "Require Gateway Host Binding";
  readonly description = "Ensures Gateway does not bind to 0.0.0.0 (all interfaces)";

  evaluate(
    config: OpenClawConfig,
    ruleConfig: Record<string, unknown>,
  ): OpenClawRuleResult {
    if (!this.isEnabled(ruleConfig)) {
      return this.pass();
    }

    if (config.gateway?.host === "0.0.0.0") {
      return {
        passed: false,
        violation: {
          ruleId: "require_gateway_host_binding",
          ruleName: this.ruleName,
          severity: "ERROR",
          message: (ruleConfig.message as string) || "Gateway must not bind to 0.0.0.0 — use 127.0.0.1 or a specific interface",
          field: "gateway.host",
          currentValue: config.gateway.host,
          suggestedValue: "127.0.0.1",
        },
      };
    }

    return this.pass();
  }
}

// Self-register on import
defaultRegistry.register(new RequireGatewayAuthRule());
defaultRegistry.register(new RequireGatewayHostBindingRule());
