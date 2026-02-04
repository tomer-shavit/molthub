export * from "./manifest";
export * from "./database";
export * from "./policy";
export * from "./fleet";
export * from "./template";
export * from "./policy-pack";
export * from "./openclaw-policies";
export * from "./connector";
export * from "./openclaw-channels";
export * from "./openclaw-config";
export * from "./openclaw-manifest";
export * from "./openclaw-profile";
export * from "./state-sync";
export * from "./agent-evolution";
export * from "./ai-gateway";
export * from "./constants";
export * from "./tool-security";

// Re-export policy rules registry and interfaces for extensibility
export {
  defaultRegistry,
  PolicyRuleRegistry,
  BasePolicyRuleEvaluator,
} from "./policies/rules";
export type { IPolicyRuleEvaluator } from "./policies/rules";

export const CLAWSTER_VERSION = "0.1.0";
export const API_VERSION = "clawster/v1";

export const DEFAULT_OPENCLAW_IMAGE = "openclaw:local";