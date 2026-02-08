import type { LaunchTemplateConfig, Ec2InstanceState } from "../../types";

/**
 * Manages per-bot EC2 compute resources (Launch Templates and instances).
 *
 * Uses direct RunInstances/TerminateInstances with tag-based instance discovery.
 */
export interface IAwsComputeManager {
  /**
   * Resolve the latest Ubuntu 22.04 LTS AMI ID for the current region.
   */
  resolveUbuntuAmi(): Promise<string>;

  /**
   * Create or update a Launch Template with the given configuration.
   * Returns the Launch Template ID.
   */
  ensureLaunchTemplate(name: string, config: LaunchTemplateConfig): Promise<string>;

  /**
   * Delete a Launch Template. Idempotent.
   */
  deleteLaunchTemplate(name: string): Promise<void>;

  /**
   * Launch a single EC2 instance from a Launch Template.
   * Tags the instance with `clawster:bot={botName}` for discovery.
   * Returns the instance ID.
   */
  runInstance(launchTemplateName: string, subnetId: string, botName: string): Promise<string>;

  /**
   * Terminate an EC2 instance by ID. Idempotent.
   */
  terminateInstance(instanceId: string): Promise<void>;

  /**
   * Find a running/pending instance by `clawster:bot` tag.
   * Returns the instance ID, or null if none found.
   * Excludes terminated and shutting-down instances.
   */
  findInstanceByTag(botName: string): Promise<string | null>;

  /**
   * Get the public IP of an instance by ID.
   * Returns null if instance has no public IP.
   */
  getInstancePublicIp(instanceId: string): Promise<string | null>;

  /**
   * Get the state of an instance by ID.
   * Returns "no-instance" if instance is not found.
   */
  getInstanceStatus(instanceId: string): Promise<Ec2InstanceState | "no-instance">;
}
