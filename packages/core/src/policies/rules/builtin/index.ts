/**
 * Built-in Policy Rules (OCP)
 *
 * Imports all built-in rule evaluators to trigger their self-registration.
 * New rule files should be added here to ensure they're registered on import.
 */

// Gateway rules
import "./gateway-rules";

// Channel rules
import "./channel-rules";

// Tool rules
import "./tool-rules";

// Sandbox rules
import "./sandbox-rules";

// Isolation rules
import "./isolation-rules";

// Production rules
import "./production-rules";

// Re-export the registry for convenience
export { defaultRegistry, PolicyRuleRegistry } from "../registry";
export type { IPolicyRuleEvaluator } from "../rule-interface";
export { BasePolicyRuleEvaluator } from "../rule-interface";
