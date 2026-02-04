/**
 * OpenClaw Policy Packs
 *
 * Re-exports all policy packs and the builtin collection.
 */

import type { PolicyPack } from "../../policy-pack";

export { OPENCLAW_SECURITY_BASELINE } from "./security-baseline";
export { OPENCLAW_PRODUCTION_HARDENING } from "./production-hardening";
export { OPENCLAW_CHANNEL_SAFETY } from "./channel-safety";

import { OPENCLAW_SECURITY_BASELINE } from "./security-baseline";
import { OPENCLAW_PRODUCTION_HARDENING } from "./production-hardening";
import { OPENCLAW_CHANNEL_SAFETY } from "./channel-safety";

export const BUILTIN_OPENCLAW_POLICY_PACKS: PolicyPack[] = [
  OPENCLAW_SECURITY_BASELINE,
  OPENCLAW_PRODUCTION_HARDENING,
  OPENCLAW_CHANNEL_SAFETY,
];
