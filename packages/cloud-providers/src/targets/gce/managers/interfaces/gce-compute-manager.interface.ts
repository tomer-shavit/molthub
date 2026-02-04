/**
 * GCE Compute Manager Interface
 *
 * Provides abstraction for VM instances, disks, and instance groups.
 * Enables dependency injection for testing and modularity.
 */

import type { VmInstanceConfig, NamedPort, VmStatus } from "../../types";

/**
 * Interface for managing GCE compute resources.
 */
export interface IGceComputeManager {
  /**
   * Create a new VM instance.
   *
   * @param config - VM instance configuration
   * @returns Instance self-link URL
   */
  createVmInstance(config: VmInstanceConfig): Promise<string>;

  /**
   * Update VM instance metadata.
   *
   * @param instanceName - Instance name
   * @param metadata - Key-value pairs to update
   */
  updateVmMetadata(instanceName: string, metadata: Record<string, string>): Promise<void>;

  /**
   * Ensure an unmanaged instance group exists with the specified instance.
   *
   * @param name - Instance group name
   * @param instanceName - VM instance to add to the group
   * @param namedPort - Named port for load balancing
   * @param vpcName - VPC network name
   * @returns Instance group self-link URL
   */
  ensureInstanceGroup(
    name: string,
    instanceName: string,
    namedPort: NamedPort,
    vpcName: string
  ): Promise<string>;

  /**
   * Start a VM instance.
   *
   * @param name - Instance name
   */
  startInstance(name: string): Promise<void>;

  /**
   * Stop a VM instance.
   *
   * @param name - Instance name
   */
  stopInstance(name: string): Promise<void>;

  /**
   * Reset (restart) a VM instance.
   *
   * @param name - Instance name
   */
  resetInstance(name: string): Promise<void>;

  /**
   * Get the status of a VM instance.
   *
   * @param name - Instance name
   * @returns VM status
   */
  getInstanceStatus(name: string): Promise<VmStatus>;

  /**
   * Get VM instance details.
   *
   * @param name - Instance name
   * @returns Instance details or null if not found
   */
  getInstance(name: string): Promise<{
    status?: string | null;
    machineType?: string | null;
    metadata?: {
      items?: Array<{ key?: string | null; value?: string | null }> | null;
    } | null;
  } | null>;

  /**
   * Resize a VM instance (change machine type).
   * Note: VM must be stopped first.
   *
   * @param name - Instance name
   * @param machineType - New machine type
   */
  resizeInstance(name: string, machineType: string): Promise<void>;

  /**
   * Ensure a data disk exists.
   *
   * @param name - Disk name
   * @param sizeGb - Disk size in GB
   * @param diskType - Disk type (default: "pd-standard")
   */
  ensureDataDisk(name: string, sizeGb: number, diskType?: string): Promise<void>;

  /**
   * Resize a disk (can only increase size).
   *
   * @param name - Disk name
   * @param sizeGb - New size in GB
   */
  resizeDisk(name: string, sizeGb: number): Promise<void>;

  /**
   * Get disk details.
   *
   * @param name - Disk name
   * @returns Disk details or null if not found
   */
  getDisk(name: string): Promise<{ sizeGb?: string | number | null } | null>;

  /**
   * Delete a VM instance.
   *
   * @param name - Instance name
   */
  deleteInstance(name: string): Promise<void>;

  /**
   * Delete a disk.
   *
   * @param name - Disk name
   */
  deleteDisk(name: string): Promise<void>;

  /**
   * Delete an instance group.
   *
   * @param name - Instance group name
   */
  deleteInstanceGroup(name: string): Promise<void>;
}
