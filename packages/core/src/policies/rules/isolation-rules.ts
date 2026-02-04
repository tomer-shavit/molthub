/**
 * Isolation-related policy rules
 *
 * Rules for validating workspace isolation, port spacing, and file permissions.
 */

import type { OpenClawConfig, OpenClawEvaluationContext, OpenClawRuleResult } from "../types";

/**
 * Evaluates that each instance has a unique workspace directory.
 */
export function evaluateRequireWorkspaceIsolation(
  config: OpenClawConfig,
  ruleConfig: { enabled?: boolean; message?: string },
  context?: OpenClawEvaluationContext,
): OpenClawRuleResult {
  if (ruleConfig.enabled === false) {
    return { passed: true };
  }

  const workspace = config.agents?.defaults?.workspace;

  if (!workspace) {
    return {
      passed: false,
      violation: {
        ruleId: "require_workspace_isolation",
        ruleName: "Require Workspace Isolation",
        severity: "ERROR",
        message: ruleConfig.message || "Instance must have a unique workspace directory configured",
        field: "agents.defaults.workspace",
        currentValue: workspace,
      },
    };
  }

  if (context?.otherInstances) {
    const duplicate = context.otherInstances.find((inst) => inst.workspace === workspace);
    if (duplicate) {
      return {
        passed: false,
        violation: {
          ruleId: "require_workspace_isolation",
          ruleName: "Require Workspace Isolation",
          severity: "ERROR",
          message: ruleConfig.message || `Workspace '${workspace}' is already used by instance '${duplicate.instanceId}'`,
          field: "agents.defaults.workspace",
          currentValue: workspace,
        },
      };
    }
  }

  return { passed: true };
}

/**
 * Evaluates that gateway ports have at least the minimum gap between instances.
 */
export function evaluateRequirePortSpacing(
  config: OpenClawConfig,
  ruleConfig: { minimumGap?: number; message?: string },
  context?: OpenClawEvaluationContext,
): OpenClawRuleResult {
  const minimumGap = ruleConfig.minimumGap ?? 20;
  const port = config.gateway?.port;

  if (port === undefined || !context?.otherInstances) {
    return { passed: true };
  }

  for (const other of context.otherInstances) {
    if (other.gatewayPort === undefined) continue;
    const gap = Math.abs(port - other.gatewayPort);
    if (gap < minimumGap && gap > 0) {
      return {
        passed: false,
        violation: {
          ruleId: "require_port_spacing",
          ruleName: "Require Port Spacing",
          severity: "ERROR",
          message: ruleConfig.message || `Port ${port} is only ${gap} away from instance '${other.instanceId}' (port ${other.gatewayPort}). Minimum gap is ${minimumGap}`,
          field: "gateway.port",
          currentValue: port,
        },
      };
    }
  }

  return { passed: true };
}

/**
 * Evaluates that config file and state directory permissions are secure.
 */
export function evaluateRequireConfigPermissions(
  config: OpenClawConfig,
  ruleConfig: { configFileMode?: string; stateDirMode?: string; message?: string },
): OpenClawRuleResult {
  const expectedConfigMode = ruleConfig.configFileMode || "600";
  const expectedStateDirMode = ruleConfig.stateDirMode || "700";

  const configMode = config.filePermissions?.configFileMode;
  const stateMode = config.filePermissions?.stateDirMode;

  if (configMode && configMode !== expectedConfigMode) {
    return {
      passed: false,
      violation: {
        ruleId: "require_config_permissions",
        ruleName: "Require Config Permissions",
        severity: "ERROR",
        message: ruleConfig.message || `Config file permissions must be ${expectedConfigMode}, got ${configMode}`,
        field: "filePermissions.configFileMode",
        currentValue: configMode,
        suggestedValue: expectedConfigMode,
      },
    };
  }

  if (stateMode && stateMode !== expectedStateDirMode) {
    return {
      passed: false,
      violation: {
        ruleId: "require_config_permissions",
        ruleName: "Require Config Permissions",
        severity: "ERROR",
        message: ruleConfig.message || `State directory permissions must be ${expectedStateDirMode}, got ${stateMode}`,
        field: "filePermissions.stateDirMode",
        currentValue: stateMode,
        suggestedValue: expectedStateDirMode,
      },
    };
  }

  return { passed: true };
}
