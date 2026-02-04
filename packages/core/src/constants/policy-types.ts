/**
 * OpenClaw-specific policy rule type constants.
 *
 * These constants define the OpenClaw security policy rule types that can be
 * used in policy packs to enforce security guardrails on OpenClaw instances.
 *
 * Note: The full set of policy rule types (including generic ones) is defined
 * in the PolicyRuleType Zod schema in policy-pack.ts. These constants provide
 * convenient access to the OpenClaw-specific rule type values.
 */

export const OPENCLAW_POLICY_RULES = {
  // Gateway security
  REQUIRE_GATEWAY_AUTH: "require_gateway_auth",
  REQUIRE_GATEWAY_HOST_BINDING: "require_gateway_host_binding",

  // Channel access control
  REQUIRE_DM_POLICY: "require_dm_policy",
  FORBID_OPEN_GROUP_POLICY: "forbid_open_group_policy",
  REQUIRE_CHANNEL_ALLOWLIST: "require_channel_allowlist",

  // File permissions
  REQUIRE_CONFIG_PERMISSIONS: "require_config_permissions",

  // Tool security
  FORBID_DANGEROUS_TOOLS: "forbid_dangerous_tools",
  FORBID_ELEVATED_TOOLS: "forbid_elevated_tools",
  LIMIT_TOOL_PROFILE: "limit_tool_profile",

  // Sandbox enforcement
  REQUIRE_SANDBOX: "require_sandbox",
  REQUIRE_SANDBOX_SECURITY_OPTIONS: "require_sandbox_security_options",

  // Model guardrails
  REQUIRE_MODEL_GUARDRAILS: "require_model_guardrails",

  // Isolation
  REQUIRE_WORKSPACE_ISOLATION: "require_workspace_isolation",
  REQUIRE_PORT_SPACING: "require_port_spacing",

  // Credential management
  REQUIRE_TOKEN_ROTATION: "require_token_rotation",

  // Skills verification
  REQUIRE_SKILL_VERIFICATION: "require_skill_verification",
} as const;

export type OpenClawPolicyRule =
  (typeof OPENCLAW_POLICY_RULES)[keyof typeof OPENCLAW_POLICY_RULES];
