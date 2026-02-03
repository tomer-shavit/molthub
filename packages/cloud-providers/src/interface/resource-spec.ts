/**
 * Resource specification types for OpenClaw deployments.
 *
 * Provides a unified abstraction for resource allocation across
 * different cloud providers (ECS, GCE, Azure VM).
 */

/**
 * Resource tier for simplified user selection.
 * Maps to provider-specific configurations internally.
 */
export type ResourceTier = "light" | "standard" | "performance" | "custom";

/**
 * Unified resource specification.
 * Provider implementations translate these to their native formats.
 */
export interface ResourceSpec {
  /** CPU allocation in ECS units (256-4096). For VMs, mapped to machine type. */
  cpu: number;
  /** Memory allocation in MiB (512-30720). For VMs, mapped to machine type. */
  memory: number;
  /** Data disk size in GB for persistent storage (optional). */
  dataDiskSizeGb?: number;
}

/**
 * Result of a resource update operation.
 */
export interface ResourceUpdateResult {
  success: boolean;
  message: string;
  /** Whether the deployment requires a restart for changes to take effect. */
  requiresRestart: boolean;
  /** Estimated downtime in seconds (for operations requiring restart). */
  estimatedDowntime?: number;
}

/**
 * Resource tier specifications by provider.
 */
export interface TierSpec {
  tier: ResourceTier;
  cpu: number;
  memory: number;
  dataDiskSizeGb: number;
  /** Provider-specific machine type (for VM-based providers). */
  machineType?: string;
  /** Provider-specific VM size (for Azure). */
  vmSize?: string;
}

/**
 * ECS EC2 tier specifications.
 */
export const ECS_TIER_SPECS: Record<Exclude<ResourceTier, "custom">, TierSpec> = {
  light: {
    tier: "light",
    cpu: 512,
    memory: 1024,
    dataDiskSizeGb: 5,
  },
  standard: {
    tier: "standard",
    cpu: 1024,
    memory: 2048,
    dataDiskSizeGb: 10,
  },
  performance: {
    tier: "performance",
    cpu: 2048,
    memory: 4096,
    dataDiskSizeGb: 20,
  },
};

/**
 * GCE tier specifications.
 */
export const GCE_TIER_SPECS: Record<Exclude<ResourceTier, "custom">, TierSpec> = {
  light: {
    tier: "light",
    cpu: 256, // 0.25 vCPU equivalent
    memory: 1024,
    dataDiskSizeGb: 5,
    machineType: "e2-micro",
  },
  standard: {
    tier: "standard",
    cpu: 2048, // 2 vCPU equivalent
    memory: 2048,
    dataDiskSizeGb: 10,
    machineType: "e2-small",
  },
  performance: {
    tier: "performance",
    cpu: 2048, // 2 vCPU equivalent
    memory: 4096,
    dataDiskSizeGb: 20,
    machineType: "e2-medium",
  },
};

/**
 * Azure VM tier specifications.
 */
export const AZURE_TIER_SPECS: Record<Exclude<ResourceTier, "custom">, TierSpec> = {
  light: {
    tier: "light",
    cpu: 1024, // 1 vCPU equivalent
    memory: 1024,
    dataDiskSizeGb: 5,
    vmSize: "Standard_B1s",
  },
  standard: {
    tier: "standard",
    cpu: 2048, // 2 vCPU equivalent
    memory: 2048,
    dataDiskSizeGb: 10,
    vmSize: "Standard_B2s",
  },
  performance: {
    tier: "performance",
    cpu: 2048, // 2 vCPU equivalent
    memory: 4096,
    dataDiskSizeGb: 20,
    vmSize: "Standard_D2s_v3",
  },
};

/**
 * Maps a ResourceTier to provider-specific TierSpec.
 */
export function getTierSpec(
  tier: Exclude<ResourceTier, "custom">,
  provider: "ecs" | "gce" | "azure"
): TierSpec {
  switch (provider) {
    case "ecs":
      return ECS_TIER_SPECS[tier];
    case "gce":
      return GCE_TIER_SPECS[tier];
    case "azure":
      return AZURE_TIER_SPECS[tier];
  }
}

/**
 * Converts a ResourceSpec to the appropriate tier, or "custom" if it doesn't match.
 */
export function specToTier(
  spec: ResourceSpec,
  provider: "ecs" | "gce" | "azure"
): ResourceTier {
  const specs =
    provider === "ecs"
      ? ECS_TIER_SPECS
      : provider === "gce"
        ? GCE_TIER_SPECS
        : AZURE_TIER_SPECS;

  for (const [tierName, tierSpec] of Object.entries(specs)) {
    if (
      spec.cpu === tierSpec.cpu &&
      spec.memory === tierSpec.memory &&
      (spec.dataDiskSizeGb === undefined ||
        spec.dataDiskSizeGb === tierSpec.dataDiskSizeGb)
    ) {
      return tierName as ResourceTier;
    }
  }

  return "custom";
}

/**
 * Tier display information for the UI.
 */
export interface TierDisplayInfo {
  tier: ResourceTier;
  name: string;
  icon: string;
  description: string;
  features: string[];
  priceRange: string;
}

export const TIER_DISPLAY_INFO: Record<Exclude<ResourceTier, "custom">, TierDisplayInfo> = {
  light: {
    tier: "light",
    name: "Light",
    icon: "lightbulb",
    description: "Basic bots with low traffic",
    features: ["1-2 channels", "Low traffic", "Basic automation"],
    priceRange: "~$5-10/mo",
  },
  standard: {
    tier: "standard",
    name: "Standard",
    icon: "zap",
    description: "Multi-channel bots with moderate traffic",
    features: ["Multi-channel", "WhatsApp included", "Moderate traffic"],
    priceRange: "~$15-25/mo",
  },
  performance: {
    tier: "performance",
    name: "Performance",
    icon: "rocket",
    description: "Full-featured bots with high traffic",
    features: ["All features", "Sandbox mode", "Voice/Browser", "High traffic"],
    priceRange: "~$40-80/mo",
  },
};
