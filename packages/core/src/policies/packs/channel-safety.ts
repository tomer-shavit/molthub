/**
 * OpenClaw Channel Safety Policy Pack
 *
 * Channel-level safety policies for OpenClaw instances.
 */

import type { PolicyPack } from "../../policy-pack";

export const OPENCLAW_CHANNEL_SAFETY: PolicyPack = {
  id: "builtin-openclaw-channel-safety",
  name: "OpenClaw Channel Safety",
  description: "Channel-level safety policies for OpenClaw instances",
  isBuiltin: true,
  autoApply: true,
  rules: [
    {
      id: "openclaw-channel-dm-policy",
      name: "Channel DM Policy",
      description: "DM policy in production must be 'pairing' or 'allowlist'",
      type: "require_dm_policy",
      severity: "WARNING",
      targetResourceTypes: ["instance"],
      enabled: true,
      allowOverride: true,
      config: {
        type: "require_dm_policy",
        forbiddenValues: ["open"],
        allowedValues: ["pairing", "allowlist"],
      },
    },
    {
      id: "openclaw-require-port-spacing",
      name: "Require Port Spacing",
      description: "Gateway ports must have at least 20 port gap between instances",
      type: "require_port_spacing",
      severity: "ERROR",
      targetResourceTypes: ["instance"],
      enabled: true,
      allowOverride: false,
      config: {
        type: "require_port_spacing",
        minimumGap: 20,
      },
    },
  ],
  isEnforced: true,
  priority: 150,
  version: "1.0.0",
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: "system",
};
