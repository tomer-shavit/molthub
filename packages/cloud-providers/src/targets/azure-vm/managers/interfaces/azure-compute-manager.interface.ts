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
   */
  createDataDisk(name: string, sizeGb: number): Promise<Disk>;

  /**
   * Create a network interface.
   * @param publicIpId - Optional public IP resource ID to attach
   */
  createNic(name: string, subnetId: string, publicIpId?: string): Promise<NetworkInterface>;

  /**
   * Create a VM instance.
   * @param diskId - Data disk resource ID (undefined = no data disk)
   * @param userAssignedIdentityId - Full resource ID of a user-assigned managed identity to attach
   */
  createVm(
    vmName: string,
    nicId: string,
    diskId: string | undefined,
    vmSize: string,
    osDiskSizeGb: number,
    cloudInit: string,
    sshPublicKey?: string,
    tags?: Record<string, string>,
    userAssignedIdentityId?: string
  ): Promise<VirtualMachine>;

  startVm(name: string): Promise<void>;
  stopVm(name: string): Promise<void>;
  restartVm(name: string): Promise<void>;
  getVmStatus(name: string): Promise<VmStatus>;
  resizeVm(name: string, size: string): Promise<void>;
  resizeDisk(name: string, sizeGb: number): Promise<void>;
  runCommand(vmName: string, script: string[]): Promise<string>;
  deleteVm(name: string): Promise<void>;
  deleteNic(name: string): Promise<void>;
  deleteDisk(name: string): Promise<void>;
  getVmPrivateIp(nicName: string): Promise<string | undefined>;
}
