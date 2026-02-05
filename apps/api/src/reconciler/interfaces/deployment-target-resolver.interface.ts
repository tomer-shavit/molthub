import type { BotInstance } from "@clawster/database";
import type { DeploymentTarget, DeploymentTargetType } from "@clawster/cloud-providers";

/**
 * IDeploymentTargetResolver — resolves deployment targets and type mappings.
 *
 * Single Responsibility: Resolve deployment targets from DB or instance metadata,
 * and convert between deployment type strings and enums.
 */
export interface IDeploymentTargetResolver {
  /**
   * Resolve the DeploymentTarget implementation for a BotInstance.
   * Uses the DeploymentTarget DB record if present, otherwise falls back
   * to deriving from deploymentType enum.
   */
  resolveTarget(instance: BotInstance): Promise<DeploymentTarget>;

  /**
   * Map a BotInstance's deploymentType enum to the string format used by
   * the adapter registry (e.g., "LOCAL" → "local", "ECS_EC2" → "ecs-ec2").
   */
  resolveDeploymentType(instance: BotInstance): string;

  /**
   * Convert a deployment type string (e.g., "docker", "ecs-ec2") to the
   * corresponding DeploymentTargetType enum value.
   */
  stringToDeploymentTargetType(type: string): DeploymentTargetType | undefined;

  /**
   * Get the install step ID from the adapter registry for a deployment type.
   */
  getInstallStepId(deploymentType: string): string;

  /**
   * Get the start step ID from the adapter registry for a deployment type.
   */
  getStartStepId(deploymentType: string): string;
}

/**
 * Injection token for IDeploymentTargetResolver.
 */
export const DEPLOYMENT_TARGET_RESOLVER = Symbol("DEPLOYMENT_TARGET_RESOLVER");
