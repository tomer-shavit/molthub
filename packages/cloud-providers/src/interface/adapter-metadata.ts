/**
 * Adapter Metadata Interface
 *
 * Defines the self-describing metadata that each deployment target adapter
 * must provide. This enables true pluggability - new cloud providers can be
 * added without modifying the reconciler, factory, or provisioning events.
 */

import type { DeploymentTarget, DeploymentTargetType } from "./deployment-target";
import type { ResourceTier, TierSpec } from "./resource-spec";

/**
 * Definition of a single provisioning step.
 */
export interface ProvisioningStepDefinition {
  /** Unique identifier for this step (e.g., "create_vm", "start_container") */
  id: string;
  /** Human-readable name for UI display */
  name: string;
  /** Optional description of what this step does */
  description?: string;
  /** Estimated duration in seconds (for progress indicators) */
  estimatedDurationSec?: number;
}

/**
 * Capabilities matrix for a deployment target.
 * Used by UI and reconciler to determine available features.
 */
export interface AdapterCapabilities {
  /** Supports updateResources() for CPU/memory scaling */
  scaling: boolean;
  /** Supports Docker-in-Docker sandbox mode */
  sandbox: boolean;
  /** Has persistent storage for WhatsApp sessions, etc. */
  persistentStorage: boolean;
  /** Provides HTTPS endpoint (via load balancer, etc.) */
  httpsEndpoint: boolean;
  /** Supports real-time log streaming */
  logStreaming: boolean;
}

/**
 * Credential requirement for deployment target configuration.
 */
export interface CredentialRequirement {
  /** Field key in the config (e.g., "accessKeyId") */
  key: string;
  /** Human-readable name for UI (e.g., "AWS Access Key ID") */
  displayName: string;
  /** Description or help text */
  description: string;
  /** Whether this credential is required */
  required: boolean;
  /** Whether this is a sensitive value (should be masked in UI) */
  sensitive: boolean;
  /** Optional validation regex pattern */
  pattern?: string;
}

/**
 * Complete metadata for a deployment target adapter.
 * Each adapter implements this to describe itself.
 */
export interface AdapterMetadata {
  /** Unique type identifier (must match DeploymentTargetType enum) */
  type: DeploymentTargetType;
  /** Display name for UI (e.g., "AWS ECS EC2") */
  displayName: string;
  /** Icon identifier for UI (e.g., "aws", "docker", "gcp") */
  icon: string;
  /** Short description for UI */
  description: string;
  /** Current implementation status */
  status: "ready" | "beta" | "coming_soon";

  /** Ordered list of steps for initial provisioning */
  provisioningSteps: ProvisioningStepDefinition[];
  /** Steps for resource update operations (scaling) */
  resourceUpdateSteps: ProvisioningStepDefinition[];

  /**
   * Maps operation types to their primary step IDs.
   * Used by reconciler to identify key steps.
   */
  operationSteps: {
    /** Step ID that represents "install" completion */
    install: string;
    /** Step ID shown after install completes (e.g., "wait_stack_complete", "create_container") */
    postInstall?: string;
    /** Step ID for the configure phase (e.g., "configure_secrets", "write_config") */
    configure?: string;
    /** Step ID that represents "start" completion */
    start: string;
  };

  /** Capabilities supported by this target */
  capabilities: AdapterCapabilities;

  /** Credentials required to use this target */
  credentials: CredentialRequirement[];

  /** Credential vault type for saving/loading credentials. If undefined, saving is not supported. */
  vaultType?: string;

  /**
   * Resource tier specifications for this provider.
   * Maps tier names to provider-specific resource configs.
   */
  tierSpecs?: Record<Exclude<ResourceTier, "custom">, TierSpec>;
}

/**
 * Extension of DeploymentTarget that includes self-describing metadata.
 * New adapters should implement this interface.
 */
export interface SelfDescribingDeploymentTarget extends DeploymentTarget {
  /**
   * Return metadata describing this adapter's capabilities,
   * provisioning steps, and configuration requirements.
   */
  getMetadata(): AdapterMetadata;
}

/**
 * Type guard to check if a target implements SelfDescribingDeploymentTarget.
 */
export function isSelfDescribing(
  target: DeploymentTarget
): target is SelfDescribingDeploymentTarget {
  return typeof (target as SelfDescribingDeploymentTarget).getMetadata === "function";
}
