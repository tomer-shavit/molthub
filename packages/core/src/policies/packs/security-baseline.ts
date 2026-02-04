/**
 * OpenClaw Security Baseline Policy Pack
 *
 * Essential security policies for all OpenClaw instances.
 */

import type { PolicyPack } from "../../policy-pack";

export const OPENCLAW_SECURITY_BASELINE: PolicyPack = {
  id: "builtin-openclaw-security-baseline",
  name: "OpenClaw Security Baseline",
  description: "Essential security policies for all OpenClaw instances",
  isBuiltin: true,
  autoApply: true,
  rules: [
    {
      id: "openclaw-require-gateway-auth",
      name: "Require Gateway Authentication",
      description: "Gateway must have token or password authentication configured",
      type: "require_gateway_auth",
      severity: "ERROR",
      targetResourceTypes: ["instance"],
      enabled: true,
      allowOverride: false,
      config: {
        type: "require_gateway_auth",
        enabled: true,
      },
    },
    {
      id: "openclaw-require-dm-policy",
      name: "Require DM Policy",
      description: "DM policy must not be 'open' for security",
      type: "require_dm_policy",
      severity: "ERROR",
      targetResourceTypes: ["instance"],
      enabled: true,
      allowOverride: false,
      config: {
        type: "require_dm_policy",
        forbiddenValues: ["open"],
      },
    },
    {
      id: "openclaw-forbid-elevated-tools",
      name: "Restrict Elevated Tools",
      description: "Elevated tools must have allowFrom restrictions",
      type: "forbid_elevated_tools",
      severity: "WARNING",
      targetResourceTypes: ["instance"],
      enabled: true,
      allowOverride: true,
      config: {
        type: "forbid_elevated_tools",
        enabled: true,
      },
    },
    {
      id: "openclaw-require-workspace-isolation",
      name: "Require Workspace Isolation",
      description: "Each instance must have a unique workspace directory",
      type: "require_workspace_isolation",
      severity: "ERROR",
      targetResourceTypes: ["instance"],
      enabled: true,
      allowOverride: false,
      config: {
        type: "require_workspace_isolation",
        enabled: true,
      },
    },
    {
      id: "openclaw-forbid-dangerous-tools",
      name: "Forbid Dangerous Tools",
      description: "Password managers and credential stores must not be explicitly allowed",
      type: "forbid_dangerous_tools",
      severity: "ERROR",
      targetResourceTypes: ["instance"],
      enabled: true,
      allowOverride: false,
      config: {
        type: "forbid_dangerous_tools",
        enabled: true,
      },
    },
    {
      id: "openclaw-require-gateway-host-binding",
      name: "Require Gateway Host Binding",
      description: "Gateway must not bind to 0.0.0.0",
      type: "require_gateway_host_binding",
      severity: "ERROR",
      targetResourceTypes: ["instance"],
      enabled: true,
      allowOverride: false,
      config: {
        type: "require_gateway_host_binding",
        enabled: true,
      },
    },
    {
      id: "openclaw-require-sandbox-security-options",
      name: "Require Sandbox Security Options",
      description: "Docker sandbox must have hardened security options when enabled",
      type: "require_sandbox_security_options",
      severity: "WARNING",
      targetResourceTypes: ["instance"],
      enabled: true,
      allowOverride: true,
      config: {
        type: "require_sandbox_security_options",
        enabled: true,
      },
    },
    {
      id: "openclaw-require-channel-allowlist",
      name: "Require Channel Allowlist",
      description: "All channels must use allowlist or pairing-based access control",
      type: "require_channel_allowlist",
      severity: "ERROR",
      targetResourceTypes: ["instance"],
      enabled: true,
      allowOverride: false,
      config: { type: "require_channel_allowlist", enabled: true },
    },
  ],
  isEnforced: true,
  priority: 100,
  version: "1.0.0",
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: "system",
};
