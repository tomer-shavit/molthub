/**
 * Compute Service Interface
 *
 * Provides abstraction for compute instance operations across cloud providers.
 * Implemented by AWS EC2 Service, Azure Compute Service, GCP Compute Engine Service, etc.
 */

import type {
  InstanceConfig,
  InstanceResult,
  InstanceStatus,
} from "../types/compute";

/**
 * Interface for managing compute instances across cloud providers.
 */
export interface IComputeService {
  /**
   * Create a new compute instance.
   *
   * @param name - Instance name
   * @param config - Instance configuration
   * @returns Instance creation result with ID, IPs, and status
   */
  createInstance(name: string, config: InstanceConfig): Promise<InstanceResult>;

  /**
   * Delete a compute instance.
   *
   * @param name - Instance name or ID
   */
  deleteInstance(name: string): Promise<void>;

  /**
   * Start a stopped compute instance.
   *
   * @param name - Instance name or ID
   */
  startInstance(name: string): Promise<void>;

  /**
   * Stop a running compute instance.
   *
   * @param name - Instance name or ID
   */
  stopInstance(name: string): Promise<void>;

  /**
   * Restart a compute instance.
   *
   * @param name - Instance name or ID
   */
  restartInstance(name: string): Promise<void>;

  /**
   * Get the current status of a compute instance.
   *
   * @param name - Instance name or ID
   * @returns Current instance status
   */
  getInstanceStatus(name: string): Promise<InstanceStatus>;

  /**
   * Run commands on a compute instance.
   * Uses provider-specific mechanisms (SSM, Run Command, SSH, etc.)
   *
   * @param name - Instance name or ID
   * @param commands - Array of commands to execute
   * @returns Combined command output
   */
  runCommand(name: string, commands: string[]): Promise<string>;
}
