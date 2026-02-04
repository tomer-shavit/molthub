/**
 * Sandbox Policy Rules (OCP)
 *
 * Class-based rule evaluators for Docker sandbox configuration.
 * Self-register with the default registry on import.
 */

import { defaultRegistry } from "../registry";
import { BasePolicyRuleEvaluator } from "../rule-interface";
import type { OpenClawConfig, OpenClawRuleResult } from "../../types";

/**
 * Ensures sandbox mode is enabled and set to an allowed mode.
 */
export class RequireSandboxRule extends BasePolicyRuleEvaluator {
  readonly ruleType = "require_sandbox";
  readonly ruleName = "Require Docker Sandbox";
  readonly description = "Ensures sandbox mode is enabled and set to an allowed mode";

  evaluate(
    config: OpenClawConfig,
    ruleConfig: Record<string, unknown>,
  ): OpenClawRuleResult {
    if (!this.isEnabled(ruleConfig)) {
      return this.pass();
    }

    const sandboxMode = config.agents?.defaults?.sandbox?.mode;
    const allowedModes = (ruleConfig.allowedModes as string[]) || ["non-main", "all"];

    if (!sandboxMode || sandboxMode === "off") {
      return {
        passed: false,
        violation: {
          ruleId: "require_sandbox",
          ruleName: this.ruleName,
          severity: "ERROR",
          message: (ruleConfig.message as string) || `Sandbox mode must be one of: ${allowedModes.join(", ")}. Got: ${sandboxMode || "none"}`,
          field: "agents.defaults.sandbox.mode",
          currentValue: sandboxMode,
          suggestedValue: allowedModes[0],
        },
      };
    }

    if (!allowedModes.includes(sandboxMode)) {
      return {
        passed: false,
        violation: {
          ruleId: "require_sandbox",
          ruleName: this.ruleName,
          severity: "ERROR",
          message: (ruleConfig.message as string) || `Sandbox mode '${sandboxMode}' is not allowed. Use one of: ${allowedModes.join(", ")}`,
          field: "agents.defaults.sandbox.mode",
          currentValue: sandboxMode,
          suggestedValue: allowedModes[0],
        },
      };
    }

    return this.pass();
  }
}

/**
 * Ensures Docker sandbox has hardened security options when enabled.
 */
export class RequireSandboxSecurityOptionsRule extends BasePolicyRuleEvaluator {
  readonly ruleType = "require_sandbox_security_options";
  readonly ruleName = "Require Sandbox Security Options";
  readonly description = "Ensures Docker sandbox has hardened security options when enabled";

  evaluate(
    config: OpenClawConfig,
    ruleConfig: Record<string, unknown>,
  ): OpenClawRuleResult {
    if (!this.isEnabled(ruleConfig)) {
      return this.pass();
    }

    // Only check when sandbox is active (mode is not "off")
    if (!config.sandbox?.mode || config.sandbox.mode === "off") {
      return this.pass();
    }

    const docker = config.sandbox?.docker;
    const issues: string[] = [];

    if (docker?.readOnlyRootfs !== true) {
      issues.push("readOnlyRootfs must be true");
    }
    if (docker?.noNewPrivileges !== true) {
      issues.push("noNewPrivileges must be true");
    }
    if (!docker?.dropCapabilities || !docker.dropCapabilities.includes("ALL")) {
      issues.push('dropCapabilities must include "ALL"');
    }

    if (issues.length > 0) {
      return {
        passed: false,
        violation: {
          ruleId: "require_sandbox_security_options",
          ruleName: this.ruleName,
          severity: "WARNING",
          message: (ruleConfig.message as string) || `Docker sandbox security options are not hardened: ${issues.join("; ")}`,
          field: "sandbox.docker",
          currentValue: docker,
        },
      };
    }

    return this.pass();
  }
}

// Self-register on import
defaultRegistry.register(new RequireSandboxRule());
defaultRegistry.register(new RequireSandboxSecurityOptionsRule());
