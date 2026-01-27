import { z } from "zod";

// PolicyPack: Enforced rules that apply to instances
export const PolicySeverity = z.enum(["ERROR", "WARNING", "INFO"]);
export type PolicySeverity = z.infer<typeof PolicySeverity>;

export const PolicyRuleType = z.enum([
  // Manifest structure rules
  "required_field",
  "forbidden_field",
  "field_format",
  "field_range",
  
  // Security rules
  "require_secret_manager",
  "forbid_public_admin",
  "forbid_plaintext_secrets",
  "require_image_pinning",
  "require_network_isolation",
  "forbid_wildcard_iam",
  
  // Operational rules
  "require_health_check",
  "require_observability",
  "resource_limits",
  "scaling_limits",
  
  // Custom validation
  "custom_json_schema",
  "custom_regex",
]);
export type PolicyRuleType = z.infer<typeof PolicyRuleType>;

export const PolicyRuleSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  description: z.string(),
  
  type: PolicyRuleType,
  severity: PolicySeverity.default("ERROR"),
  
  // Target specification
  targetResourceTypes: z.array(z.enum(["instance", "fleet", "template"])).default(["instance"]),
  targetEnvironments: z.array(z.enum(["dev", "staging", "prod"])).optional(),
  targetWorkspaces: z.array(z.string()).optional(),
  targetTags: z.record(z.string()).optional(),
  
  // Rule-specific configuration
  config: z.discriminatedUnion("type", [
    // Required field must exist
    z.object({
      type: z.literal("required_field"),
      field: z.string(), // JSON path, e.g., "spec.runtime.cpu"
      message: z.string().optional(),
    }),
    
    // Forbidden field must not exist
    z.object({
      type: z.literal("forbidden_field"),
      field: z.string(),
      message: z.string().optional(),
    }),
    
    // Field must match format
    z.object({
      type: z.literal("field_format"),
      field: z.string(),
      format: z.enum(["email", "url", "semver", "alphanumeric", "regex"]),
      pattern: z.string().optional(), // Required if format is "regex"
      message: z.string().optional(),
    }),
    
    // Numeric field range
    z.object({
      type: z.literal("field_range"),
      field: z.string(),
      min: z.number().optional(),
      max: z.number().optional(),
      message: z.string().optional(),
    }),
    
    // Security rules (boolean enabled)
    z.object({
      type: z.enum([
        "require_secret_manager",
        "forbid_public_admin",
        "forbid_plaintext_secrets",
        "require_image_pinning",
        "require_network_isolation",
        "forbid_wildcard_iam",
        "require_health_check",
        "require_observability",
      ]),
      enabled: z.boolean().default(true),
      message: z.string().optional(),
    }),
    
    // Resource limits
    z.object({
      type: z.literal("resource_limits"),
      maxCpu: z.number().optional(),
      maxMemory: z.number().optional(),
      maxReplicas: z.number().optional(),
      message: z.string().optional(),
    }),
    
    // Scaling limits
    z.object({
      type: z.literal("scaling_limits"),
      maxReplicas: z.number().optional(),
      requireAutoScaling: z.boolean().default(false),
      message: z.string().optional(),
    }),
    
    // Custom JSON Schema validation
    z.object({
      type: z.literal("custom_json_schema"),
      schema: z.record(z.unknown()),
      message: z.string().optional(),
    }),
    
    // Custom regex validation
    z.object({
      type: z.literal("custom_regex"),
      field: z.string(),
      pattern: z.string(),
      flags: z.string().default(""),
      message: z.string(),
    }),
  ]),
  
  // Error message override
  errorMessage: z.string().optional(),
  
  // Whether rule can be overridden at lower levels
  allowOverride: z.boolean().default(false),
  
  enabled: z.boolean().default(true),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type PolicyRule = z.infer<typeof PolicyRuleSchema>;

export const PolicyPackSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  description: z.string(),
  
  // Scope
  isBuiltin: z.boolean().default(false),
  workspaceId: z.string().optional(), // null = global policy pack
  
  // Application
  autoApply: z.boolean().default(false), // Auto-apply to all matching resources
  targetWorkspaces: z.array(z.string()).optional(),
  targetEnvironments: z.array(z.enum(["dev", "staging", "prod"])).optional(),
  targetTags: z.record(z.string()).optional(),
  
  // Rules in this pack
  rules: z.array(PolicyRuleSchema).min(1, "At least one rule required"),
  
  // Enforced packs cannot be skipped
  isEnforced: z.boolean().default(false),
  
  // Priority when multiple packs apply (higher = evaluated later)
  priority: z.number().int().default(0),
  
  // Versioning
  version: z.string().default("1.0.0"),
  
  isActive: z.boolean().default(true),
  
  createdAt: z.date(),
  updatedAt: z.date(),
  createdBy: z.string(),
});

export type PolicyPack = z.infer<typeof PolicyPackSchema>;

// Policy evaluation result
export const PolicyViolationSchema = z.object({
  ruleId: z.string(),
  ruleName: z.string(),
  severity: PolicySeverity,
  message: z.string(),
  field: z.string().optional(),
  currentValue: z.unknown().optional(),
  suggestedValue: z.unknown().optional(),
});

export type PolicyViolation = z.infer<typeof PolicyViolationSchema>;

export const PolicyEvaluationResultSchema = z.object({
  packId: z.string(),
  packName: z.string(),
  resourceId: z.string(),
  resourceType: z.enum(["instance", "fleet", "template"]),
  
  valid: z.boolean(),
  violations: z.array(PolicyViolationSchema),
  warnings: z.array(PolicyViolationSchema),
  
  evaluatedAt: z.date(),
  evaluatedBy: z.string(),
});

export type PolicyEvaluationResult = z.infer<typeof PolicyEvaluationResultSchema>;

// Built-in policy packs
export const BUILTIN_POLICY_PACKS: PolicyPack[] = [
  {
    id: "builtin-security-baseline",
    name: "Security Baseline",
    description: "Essential security policies for all Moltbot instances",
    isBuiltin: true,
    autoApply: true,
    rules: [
      {
        id: "rule-no-latest",
        name: "No Latest Image Tag",
        description: "Prevent use of 'latest' image tag for supply chain security",
        type: "field_format",
        severity: "ERROR",
        targetResourceTypes: ["instance"],
        enabled: true,
        allowOverride: false,
        config: {
          type: "field_format",
          field: "spec.runtime.image",
          format: "regex",
          pattern: "^(?!.*:latest$).+$",
        },
        errorMessage: "Image tag 'latest' is not allowed. Use a pinned version.",
      },
      {
        id: "rule-require-secrets",
        name: "Require Secrets Manager",
        description: "All secrets must be stored in AWS Secrets Manager",
        type: "require_secret_manager",
        severity: "ERROR",
        targetResourceTypes: ["instance"],
        enabled: true,
        allowOverride: false,
        config: {
          type: "require_secret_manager",
          enabled: true,
        },
      },
      {
        id: "rule-forbid-public-admin",
        name: "Forbid Public Admin Panel",
        description: "Prevent exposing admin panels publicly",
        type: "forbid_public_admin",
        severity: "ERROR",
        targetResourceTypes: ["instance"],
        enabled: true,
        allowOverride: false,
        config: {
          type: "forbid_public_admin",
          enabled: true,
        },
      },
    ],
    isEnforced: true,
    priority: 100,
    version: "1.0.0",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "system",
  },
  {
    id: "builtin-production-guardrails",
    name: "Production Guardrails",
    description: "Additional protections for production environments",
    isBuiltin: true,
    autoApply: false,
    targetEnvironments: ["prod"],
    rules: [
      {
        id: "rule-prod-replicas",
        name: "Minimum Production Replicas",
        description: "Production instances must have at least 2 replicas",
        type: "field_range",
        severity: "ERROR",
        targetResourceTypes: ["instance"],
        targetEnvironments: ["prod"],
        enabled: true,
        allowOverride: false,
        config: {
          type: "field_range",
          field: "spec.runtime.replicas",
          min: 2,
        },
      },
      {
        id: "rule-prod-observability",
        name: "Require Observability",
        description: "Production instances must have tracing enabled",
        type: "require_observability",
        severity: "WARNING",
        targetResourceTypes: ["instance"],
        targetEnvironments: ["prod"],
        enabled: true,
        allowOverride: true,
        config: {
          type: "require_observability",
          enabled: true,
        },
      },
    ],
    isEnforced: false,
    priority: 200,
    version: "1.0.0",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "system",
  },
];

// Validation helpers
export function validatePolicyRule(data: unknown): PolicyRule {
  return PolicyRuleSchema.parse(data);
}

export function validatePolicyPack(data: unknown): PolicyPack {
  return PolicyPackSchema.parse(data);
}