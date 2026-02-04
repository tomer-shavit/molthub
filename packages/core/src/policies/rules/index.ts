/**
 * OpenClaw Policy Rules
 *
 * Central dispatcher for rule evaluation and re-exports of all rule functions.
 */

import type { OpenClawConfig, OpenClawEvaluationContext, OpenClawRuleResult } from "../types";

// Gateway rules
export {
  evaluateRequireGatewayAuth,
  evaluateRequireGatewayHostBinding,
} from "./gateway-rules";

// Channel rules
export {
  evaluateRequireDmPolicy,
  evaluateForbidOpenGroupPolicy,
  evaluateRequireChannelAllowlist,
} from "./channel-rules";

// Tool rules
export {
  evaluateForbidDangerousTools,
  evaluateForbidElevatedTools,
  evaluateLimitToolProfile,
} from "./tool-rules";

// Sandbox rules
export {
  evaluateRequireSandbox,
  evaluateRequireSandboxSecurityOptions,
} from "./sandbox-rules";

// Isolation rules
export {
  evaluateRequireWorkspaceIsolation,
  evaluateRequirePortSpacing,
  evaluateRequireConfigPermissions,
} from "./isolation-rules";

// Production rules
export {
  evaluateRequireModelGuardrails,
  evaluateRequireTokenRotation,
  evaluateRequireSkillVerification,
} from "./production-rules";

// Import all functions for dispatcher
import { evaluateRequireGatewayAuth, evaluateRequireGatewayHostBinding } from "./gateway-rules";
import { evaluateRequireDmPolicy, evaluateForbidOpenGroupPolicy, evaluateRequireChannelAllowlist } from "./channel-rules";
import { evaluateForbidDangerousTools, evaluateForbidElevatedTools, evaluateLimitToolProfile } from "./tool-rules";
import { evaluateRequireSandbox, evaluateRequireSandboxSecurityOptions } from "./sandbox-rules";
import { evaluateRequireWorkspaceIsolation, evaluateRequirePortSpacing, evaluateRequireConfigPermissions } from "./isolation-rules";
import { evaluateRequireModelGuardrails, evaluateRequireTokenRotation, evaluateRequireSkillVerification } from "./production-rules";

/**
 * Main evaluation dispatcher that routes to the appropriate rule evaluator.
 */
export function evaluateOpenClawRule(
  ruleType: string,
  config: OpenClawConfig,
  ruleConfig: Record<string, unknown>,
  context?: OpenClawEvaluationContext,
): OpenClawRuleResult {
  const rc = ruleConfig as Record<string, unknown>;
  switch (ruleType) {
    case "require_gateway_auth":
      return evaluateRequireGatewayAuth(config, rc as { enabled?: boolean; message?: string });
    case "require_dm_policy":
      return evaluateRequireDmPolicy(config, rc as { forbiddenValues?: string[]; allowedValues?: string[]; message?: string });
    case "require_config_permissions":
      return evaluateRequireConfigPermissions(config, rc as { configFileMode?: string; stateDirMode?: string; message?: string });
    case "forbid_elevated_tools":
      return evaluateForbidElevatedTools(config, rc as { enabled?: boolean; message?: string });
    case "require_sandbox":
      return evaluateRequireSandbox(config, rc as { enabled?: boolean; allowedModes?: string[]; message?: string });
    case "limit_tool_profile":
      return evaluateLimitToolProfile(config, rc as { forbiddenProfiles?: string[]; message?: string });
    case "require_model_guardrails":
      return evaluateRequireModelGuardrails(config, rc as { enabled?: boolean; requireMaxTokens?: boolean; requireTemperatureLimit?: boolean; maxTemperature?: number; message?: string });
    case "require_workspace_isolation":
      return evaluateRequireWorkspaceIsolation(config, rc as { enabled?: boolean; message?: string }, context);
    case "require_port_spacing":
      return evaluateRequirePortSpacing(config, rc as { minimumGap?: number; message?: string }, context);
    case "forbid_open_group_policy":
      return evaluateForbidOpenGroupPolicy(config, rc as { forbiddenValues?: string[]; message?: string });
    case "forbid_dangerous_tools":
      return evaluateForbidDangerousTools(config, rc as { enabled?: boolean; message?: string });
    case "require_gateway_host_binding":
      return evaluateRequireGatewayHostBinding(config, rc as { enabled?: boolean; message?: string });
    case "require_sandbox_security_options":
      return evaluateRequireSandboxSecurityOptions(config, rc as { enabled?: boolean; message?: string });
    case "require_channel_allowlist":
      return evaluateRequireChannelAllowlist(config, rc as { enabled?: boolean; message?: string });
    case "require_token_rotation":
      return evaluateRequireTokenRotation(config, rc as { enabled?: boolean; maxAgeDays?: number; message?: string });
    case "require_skill_verification":
      return evaluateRequireSkillVerification(config, rc as { enabled?: boolean; message?: string });
    default:
      return { passed: true };
  }
}
