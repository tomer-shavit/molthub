import { z } from "zod";
import { Environment, RuntimeConfigSchema, SecretRefSchema, ChannelConfigSchema, SkillsPolicySchema, PartialSkillsPolicySchema, NetworkConfigSchema, ObservabilityConfigSchema, PolicyConfigSchema } from "./manifest";

// Template: Bot archetypes for quick instance creation
export const TemplateCategory = z.enum([
  "minimal",
  "slack",
  "discord", 
  "telegram",
  "webhook",
  "custom"
]);
export type TemplateCategory = z.infer<typeof TemplateCategory>;

export const TemplateSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  description: z.string(),
  category: TemplateCategory,
  
  // Template scope
  isBuiltin: z.boolean().default(false),
  workspaceId: z.string().optional(), // null = global template
  
  // The base manifest template
  manifestTemplate: z.object({
    apiVersion: z.literal("molthub/v1"),
    kind: z.literal("MoltbotInstance"),
    spec: z.object({
      runtime: RuntimeConfigSchema.partial().optional(),
      secrets: z.array(SecretRefSchema).default([]),
      channels: z.array(ChannelConfigSchema).default([]),
      skills: SkillsPolicySchema.optional(),
      network: NetworkConfigSchema.optional(),
      observability: ObservabilityConfigSchema.optional(),
      policies: PolicyConfigSchema.optional(),
    }),
  }),
  
  // User-configurable fields with defaults
  configurableFields: z.array(z.object({
    path: z.string(), // JSON path to field in manifest, e.g., "spec.runtime.cpu"
    label: z.string(),
    description: z.string().optional(),
    type: z.enum(["string", "number", "boolean", "select", "secret"]),
    required: z.boolean().default(false),
    defaultValue: z.unknown().optional(),
    options: z.array(z.object({
      value: z.unknown(),
      label: z.string(),
    })).optional(), // For select type
  })).default([]),
  
  // Required secrets that must be provided
  requiredSecrets: z.array(z.object({
    name: z.string(),
    description: z.string(),
    channel: z.enum(["slack", "telegram", "webhook", "discord"]).optional(),
  })).default([]),
  
  // Tags for discoverability
  tags: z.array(z.string()).default([]),
  
  createdAt: z.date(),
  updatedAt: z.date(),
  createdBy: z.string().optional(),
});

export type Template = z.infer<typeof TemplateSchema>;

// Profile: Shared defaults for instances
export const ProfileSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  description: z.string(),
  
  // Profile scope
  workspaceId: z.string(),
  fleetIds: z.array(z.string()).default([]), // Empty = available to all fleets in workspace
  
  // Default configurations applied to instances
  defaults: z.object({
    runtime: RuntimeConfigSchema.partial().optional(),
    secrets: z.array(SecretRefSchema).default([]),
    channels: z.array(ChannelConfigSchema).default([]),
    skills: SkillsPolicySchema.optional(),
    network: NetworkConfigSchema.optional(),
    observability: ObservabilityConfigSchema.optional(),
    policies: PolicyConfigSchema.optional(),
  }),
  
  // Merge strategy for each field
  mergeStrategy: z.record(z.enum(["override", "merge", "prepend", "append"])).default({
    "spec.secrets": "merge",
    "spec.channels": "merge",
    "spec.skills.allowlist": "merge",
  }),
  
  // Whether profile can be overridden at instance level
  allowInstanceOverrides: z.boolean().default(true),
  lockedFields: z.array(z.string()).default([]), // Fields that cannot be overridden
  
  // Priority for applying multiple profiles (higher = applied later)
  priority: z.number().int().default(0),
  
  isActive: z.boolean().default(true),
  
  createdAt: z.date(),
  updatedAt: z.date(),
  createdBy: z.string(),
});

export type Profile = z.infer<typeof ProfileSchema>;

// Overlay: Per-bot configuration overrides
export const OverlayTargetType = z.enum([
  "instance",    // Single instance
  "fleet",       // All instances in fleet
  "environment", // All instances in environment
  "tag",         // Instances matching tag selector
]);
export type OverlayTargetType = z.infer<typeof OverlayTargetType>;

export const OverlaySchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  description: z.string(),
  workspaceId: z.string(),
  
  // Target specification
  targetType: OverlayTargetType,
  targetSelector: z.object({
    instanceIds: z.array(z.string()).optional(),
    fleetId: z.string().optional(),
    environment: Environment.optional(),
    tags: z.record(z.string()).optional(), // Match instances with these tags
  }),
  
  // Override values (deep merge into manifest)
  overrides: z.object({
    runtime: RuntimeConfigSchema.partial().optional(),
    secrets: z.array(SecretRefSchema).optional(),
    channels: z.array(ChannelConfigSchema).optional(),
    skills: PartialSkillsPolicySchema.optional(),
    network: NetworkConfigSchema.partial().optional(),
    observability: ObservabilityConfigSchema.partial().optional(),
    policies: PolicyConfigSchema.partial().optional(),
    labels: z.record(z.string()).optional(),
  }),
  
  // Overlay behavior
  priority: z.number().int().default(0), // Higher priority overlays applied later
  enabled: z.boolean().default(true),
  
  // Rollout configuration for gradual application
  rollout: z.object({
    strategy: z.enum(["all", "percentage", "canary"]).default("all"),
    percentage: z.number().int().min(0).max(100).optional(),
    canaryInstances: z.array(z.string()).optional(),
  }).optional(),
  
  // Schedule for temporary overlays
  schedule: z.object({
    startTime: z.date().optional(),
    endTime: z.date().optional(),
    timezone: z.string().default("UTC"),
  }).optional(),
  
  createdAt: z.date(),
  updatedAt: z.date(),
  createdBy: z.string(),
});

export type Overlay = z.infer<typeof OverlaySchema>;

// Configuration resolution: Merge template -> profile -> overlays -> instance
export interface ConfigLayer {
  type: "template" | "profile" | "overlay" | "instance";
  id: string;
  priority: number;
  config: any;
}

export function resolveConfig(
  layers: ConfigLayer[],
  mergeStrategies: Record<string, "override" | "merge" | "prepend" | "append">
): any {
  // Sort by priority (lower first)
  const sorted = [...layers].sort((a, b) => a.priority - b.priority);
  
  // Start with empty object
  let result: any = {};
  
  for (const layer of sorted) {
    result = deepMerge(result, layer.config, mergeStrategies);
  }
  
  return result;
}

function deepMerge(
  target: any,
  source: any,
  strategies: Record<string, "override" | "merge" | "prepend" | "append">,
  path = ""
): any {
  if (source === null || source === undefined) {
    return target;
  }
  
  // Handle arrays - check strategy first
  if (Array.isArray(source)) {
    const strategy = strategies[path] || "override";
    if (strategy === "append" && Array.isArray(target)) {
      return [...target, ...source];
    } else if (strategy === "prepend" && Array.isArray(target)) {
      return [...source, ...target];
    } else if (strategy === "merge" && Array.isArray(target)) {
      return [...target, ...source];
    }
    return source;
  }
  
  if (typeof source !== "object") {
    return source;
  }
  
  const result = { ...target };
  
  for (const key of Object.keys(source)) {
    const currentPath = path ? `${path}.${key}` : key;
    const strategy = strategies[currentPath] || "override";
    
    if (Array.isArray(source[key])) {
      // Handle arrays at this level
      if (strategy === "append" && Array.isArray(result[key])) {
        result[key] = [...result[key], ...source[key]];
      } else if (strategy === "prepend" && Array.isArray(result[key])) {
        result[key] = [...source[key], ...result[key]];
      } else if (strategy === "merge" && Array.isArray(result[key])) {
        result[key] = [...result[key], ...source[key]];
      } else {
        result[key] = source[key];
      }
    } else if (strategy === "merge" && 
        typeof result[key] === "object" && 
        typeof source[key] === "object" &&
        !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key], strategies, currentPath);
    } else {
      result[key] = deepMerge(result[key], source[key], strategies, currentPath);
    }
  }
  
  return result;
}

// Validation helpers
export function validateTemplate(data: unknown): Template {
  return TemplateSchema.parse(data);
}

export function validateProfile(data: unknown): Profile {
  return ProfileSchema.parse(data);
}

export function validateOverlay(data: unknown): Overlay {
  return OverlaySchema.parse(data);
}