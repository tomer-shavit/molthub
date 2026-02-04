/**
 * Isolation Policy Rules (OCP)
 *
 * Class-based rule evaluators for workspace isolation, port spacing, and file permissions.
 * Self-register with the default registry on import.
 */

import { defaultRegistry } from "../registry";
import { BasePolicyRuleEvaluator } from "../rule-interface";
import type { OpenClawConfig, OpenClawEvaluationContext, OpenClawRuleResult } from "../../types";

/**
 * Ensures each instance has a unique workspace directory.
 */
export class RequireWorkspaceIsolationRule extends BasePolicyRuleEvaluator {
  readonly ruleType = "require_workspace_isolation";
  readonly ruleName = "Require Workspace Isolation";
  readonly description = "Ensures each instance has a unique workspace directory";

  evaluate(
    config: OpenClawConfig,
    ruleConfig: Record<string, unknown>,
    context?: OpenClawEvaluationContext,
  ): OpenClawRuleResult {
    if (!this.isEnabled(ruleConfig)) {
      return this.pass();
    }

    const workspace = config.agents?.defaults?.workspace;

    if (!workspace) {
      return {
        passed: false,
        violation: {
          ruleId: "require_workspace_isolation",
          ruleName: this.ruleName,
          severity: "ERROR",
          message: (ruleConfig.message as string) || "Instance must have a unique workspace directory configured",
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
            ruleName: this.ruleName,
            severity: "ERROR",
            message: (ruleConfig.message as string) || `Workspace '${workspace}' is already used by instance '${duplicate.instanceId}'`,
            field: "agents.defaults.workspace",
            currentValue: workspace,
          },
        };
      }
    }

    return this.pass();
  }
}

/**
 * Ensures gateway ports have at least the minimum gap between instances.
 */
export class RequirePortSpacingRule extends BasePolicyRuleEvaluator {
  readonly ruleType = "require_port_spacing";
  readonly ruleName = "Require Port Spacing";
  readonly description = "Ensures gateway ports have at least the minimum gap between instances";

  evaluate(
    config: OpenClawConfig,
    ruleConfig: Record<string, unknown>,
    context?: OpenClawEvaluationContext,
  ): OpenClawRuleResult {
    const minimumGap = (ruleConfig.minimumGap as number) ?? 20;
    const port = config.gateway?.port;

    if (port === undefined || !context?.otherInstances) {
      return this.pass();
    }

    for (const other of context.otherInstances) {
      if (other.gatewayPort === undefined) continue;
      const gap = Math.abs(port - other.gatewayPort);
      if (gap < minimumGap && gap > 0) {
        return {
          passed: false,
          violation: {
            ruleId: "require_port_spacing",
            ruleName: this.ruleName,
            severity: "ERROR",
            message: (ruleConfig.message as string) || `Port ${port} is only ${gap} away from instance '${other.instanceId}' (port ${other.gatewayPort}). Minimum gap is ${minimumGap}`,
            field: "gateway.port",
            currentValue: port,
          },
        };
      }
    }

    return this.pass();
  }
}

/**
 * Ensures config file and state directory permissions are secure.
 */
export class RequireConfigPermissionsRule extends BasePolicyRuleEvaluator {
  readonly ruleType = "require_config_permissions";
  readonly ruleName = "Require Config Permissions";
  readonly description = "Ensures config file and state directory permissions are secure";

  evaluate(
    config: OpenClawConfig,
    ruleConfig: Record<string, unknown>,
  ): OpenClawRuleResult {
    const expectedConfigMode = (ruleConfig.configFileMode as string) || "600";
    const expectedStateDirMode = (ruleConfig.stateDirMode as string) || "700";

    const configMode = config.filePermissions?.configFileMode;
    const stateMode = config.filePermissions?.stateDirMode;

    if (configMode && configMode !== expectedConfigMode) {
      return {
        passed: false,
        violation: {
          ruleId: "require_config_permissions",
          ruleName: this.ruleName,
          severity: "ERROR",
          message: (ruleConfig.message as string) || `Config file permissions must be ${expectedConfigMode}, got ${configMode}`,
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
          ruleName: this.ruleName,
          severity: "ERROR",
          message: (ruleConfig.message as string) || `State directory permissions must be ${expectedStateDirMode}, got ${stateMode}`,
          field: "filePermissions.stateDirMode",
          currentValue: stateMode,
          suggestedValue: expectedStateDirMode,
        },
      };
    }

    return this.pass();
  }
}

// Self-register on import
defaultRegistry.register(new RequireWorkspaceIsolationRule());
defaultRegistry.register(new RequirePortSpacingRule());
defaultRegistry.register(new RequireConfigPermissionsRule());
