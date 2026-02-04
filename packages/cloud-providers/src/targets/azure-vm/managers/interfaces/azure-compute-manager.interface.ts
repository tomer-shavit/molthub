/**
 * Azure Compute Manager Interface
 *
 * Provides abstraction for VM, Disk, and NIC operations.
 * Enables dependency injection for testing and modularity.
 */

import type { VirtualMachine, Disk } from "@azure/arm-compute";
import type { NetworkInterface } from "@azure/arm-network";
import type { VmStatus } from "../../types";

/**
 * Interface for managing Azure compute resources.
 */
export interface IAzureComputeManager {
  /**
   * Create a managed data disk.
   *
   * @param name - Disk name
   * @param sizeGb - Disk size in GB
   * @returns Disk resource
   */
  createDataDisk(name: string, sizeGb: number): Promise<Disk>;

  /**
   * Create a network interface.
   *
   * @param name - NIC name
   * @param subnetId - Subnet resource ID
   * @returns NIC resource
   */
  createNic(name: string, subnetId: string): Promise<NetworkInterface>;

  /**
   * Create a VM instance.
   *
   * @param vmName - VM name
   * @param nicId - NIC resource ID
   * @param diskId - Data disk resource ID
   * @param vmSize - VM size (e.g., "Standard_B2s")
   * @param osDiskSizeGb - OS disk size in GB
   * @param cloudInit - Cloud-init script content
   * @param sshPublicKey - Optional SSH public key
   * @param tags - Optional resource tags
   * @returns VM resource
   */
  createVm(
    vmName: string,
    nicId: string,
    diskId: string,
    vmSize: string,
    osDiskSizeGb: number,
    cloudInit: string,
    sshPublicKey?: string,
    tags?: Record<string, string>
  ): Promise<VirtualMachine>;

  /**
   * Start a VM.
   *
   * @param name - VM name
   */
  startVm(name: string): Promise<void>;

  /**
   * Stop (deallocate) a VM.
   *
   * @param name - VM name
   */
  stopVm(name: string): Promise<void>;

  /**
   * Restart a VM.
   *
   * @param name - VM name
   */
  restartVm(name: string): Promise<void>;

  /**
   * Get VM power state.
   *
   * @param name - VM name
   * @returns VM status
   */
  getVmStatus(name: string): Promise<VmStatus>;

  /**
   * Resize a VM.
   *
   * @param name - VM name
   * @param size - New VM size
   */
  resizeVm(name: string, size: string): Promise<void>;

  /**
   * Resize a managed disk.
   *
   * @param name - Disk name
   * @param sizeGb - New size in GB
   */
  resizeDisk(name: string, sizeGb: number): Promise<void>;

  /**
   * Run a shell script on a VM.
   *
   * @param vmName - VM name
   * @param script - Script lines to execute
   * @returns Command output
   */
  runCommand(vmName: string, script: string[]): Promise<string>;

  /**
   * Delete a VM.
   *
   * @param name - VM name
   */
  deleteVm(name: string): Promise<void>;

  /**
   * Delete a NIC.
   *
   * @param name - NIC name
   */
  deleteNic(name: string): Promise<void>;

  /**
   * Delete a disk.
   *
   * @param name - Disk name
   */
  deleteDisk(name: string): Promise<void>;

  /**
   * Get VM private IP address from NIC.
   *
   * @param nicName - NIC name
   * @returns Private IP address or undefined
   */
  getVmPrivateIp(nicName: string): Promise<string | undefined>;
}
