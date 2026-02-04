/**
 * OpenClaw Policies Module
 *
 * Re-exports all policy types, rules, packs, and evaluator functions.
 */

// Types
export type {
  OpenClawConfig,
  OpenClawEvaluationContext,
  OpenClawRuleResult,
  OpenClawPolicyEvaluationResult,
} from "./types";

// Rule dispatcher and registry
export {
  evaluateOpenClawRule,
  defaultRegistry,
  PolicyRuleRegistry,
  BasePolicyRuleEvaluator,
} from "./rules";
export type { IPolicyRuleEvaluator } from "./rules";

// Policy packs
export {
  OPENCLAW_SECURITY_BASELINE,
  OPENCLAW_PRODUCTION_HARDENING,
  OPENCLAW_CHANNEL_SAFETY,
  BUILTIN_OPENCLAW_POLICY_PACKS,
} from "./packs";

// Evaluator
export { evaluateOpenClawPolicyPack } from "./evaluator";
