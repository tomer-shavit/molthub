import type { LaunchTemplateConfig, Ec2InstanceState } from "../../types";

/**
 * Manages per-bot EC2 compute resources (Launch Templates, ASGs, instances).
 *
 * Uses ASG with maxSize=1 for auto-healing (matches GCE MIG pattern).
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
   * Create an ASG with maxSize=1, desiredCapacity=0 (stopped).
   * Idempotent — skips if ASG already exists.
   */
  ensureAsg(name: string, launchTemplateId: string, subnetId: string): Promise<void>;

  /**
   * Set ASG desired capacity (0 = stop, 1 = start).
   */
  setAsgDesiredCapacity(asgName: string, desired: number): Promise<void>;

  /**
   * Get the public IP of the running instance in an ASG.
   * Returns null if no instance is running.
   */
  getAsgInstancePublicIp(asgName: string): Promise<string | null>;

  /**
   * Get the state of the instance in an ASG.
   * Returns "no-instance" if ASG has no instances.
   */
  getAsgInstanceStatus(asgName: string): Promise<Ec2InstanceState | "no-instance">;

  /**
   * Delete an ASG (sets desired=0 first, then deletes).
   */
  deleteAsg(name: string): Promise<void>;

  /**
   * Delete a Launch Template. Idempotent.
   */
  deleteLaunchTemplate(name: string): Promise<void>;

  /**
   * Terminate and replace the ASG instance (for restart/recycle).
   */
  recycleAsgInstance(asgName: string): Promise<void>;
}
