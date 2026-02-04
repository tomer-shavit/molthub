/**
 * Sandbox-related policy rules
 *
 * Rules for validating OpenClaw Docker sandbox configuration.
 */

import type { OpenClawConfig, OpenClawRuleResult } from "../types";

/**
 * Evaluates that sandbox mode is enabled and set to an allowed mode.
 */
export function evaluateRequireSandbox(
  config: OpenClawConfig,
  ruleConfig: { enabled?: boolean; allowedModes?: string[]; message?: string },
): OpenClawRuleResult {
  if (ruleConfig.enabled === false) {
    return { passed: true };
  }

  const sandboxMode = config.agents?.defaults?.sandbox?.mode;
  const allowedModes = ruleConfig.allowedModes || ["non-main", "all"];

  if (!sandboxMode || sandboxMode === "off") {
    return {
      passed: false,
      violation: {
        ruleId: "require_sandbox",
        ruleName: "Require Docker Sandbox",
        severity: "ERROR",
        message: ruleConfig.message || `Sandbox mode must be one of: ${allowedModes.join(", ")}. Got: ${sandboxMode || "none"}`,
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
        ruleName: "Require Docker Sandbox",
        severity: "ERROR",
        message: ruleConfig.message || `Sandbox mode '${sandboxMode}' is not allowed. Use one of: ${allowedModes.join(", ")}`,
        field: "agents.defaults.sandbox.mode",
        currentValue: sandboxMode,
        suggestedValue: allowedModes[0],
      },
    };
  }

  return { passed: true };
}

/**
 * Evaluates that Docker sandbox has hardened security options when enabled.
 */
export function evaluateRequireSandboxSecurityOptions(
  config: OpenClawConfig,
  ruleConfig: { enabled?: boolean; message?: string },
): OpenClawRuleResult {
  if (ruleConfig.enabled === false) {
    return { passed: true };
  }

  // Only check when sandbox is active (mode is not "off")
  if (!config.sandbox?.mode || config.sandbox.mode === "off") {
    return { passed: true };
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
        ruleName: "Require Sandbox Security Options",
        severity: "WARNING",
        message: ruleConfig.message || `Docker sandbox security options are not hardened: ${issues.join("; ")}`,
        field: "sandbox.docker",
        currentValue: docker,
      },
    };
  }

  return { passed: true };
}
