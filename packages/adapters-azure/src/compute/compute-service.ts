/**
 * Azure Compute Service
 *
 * Provides operations for managing Azure Virtual Machines, Disks, and Network Interfaces.
 * Extracts compute operations from cloud-providers into a reusable adapter.
 */

import {
  ComputeManagementClient,
  VirtualMachine,
  Disk,
  RunCommandResult,
} from "@azure/arm-compute";
import { NetworkManagementClient, NetworkInterface } from "@azure/arm-network";
import { DefaultAzureCredential, TokenCredential } from "@azure/identity";

/**
 * VM power state values.
 */
export type VmStatus =
  | "running"
  | "stopped"
  | "deallocated"
  | "starting"
  | "stopping"
  | "unknown";

/**
 * Options for creating a VM.
 */
export interface CreateVmOptions {
  /** VM name */
  vmName: string;
  /** NIC resource ID */
  nicId: string;
  /** Data disk resource ID */
  diskId: string;
  /** VM size (e.g., "Standard_B2s") */
  vmSize: string;
  /** OS disk size in GB */
  osDiskSizeGb: number;
  /** Cloud-init script content */
  cloudInit: string;
  /** SSH public key for authentication */
  sshPublicKey?: string;
  /** Additional resource tags */
  tags?: Record<string, string>;
  /** Admin username (default: "clawster") */
  adminUsername?: string;
  /** Image publisher (default: "Canonical") */
  imagePublisher?: string;
  /** Image offer (default: "ubuntu-24_04-lts") */
  imageOffer?: string;
  /** Image SKU (default: "server") */
  imageSku?: string;
}

/**
 * Azure Compute Service for VM, Disk, and NIC operations.
 */
export class ComputeService {
  private readonly computeClient: ComputeManagementClient;
  private readonly networkClient: NetworkManagementClient;
  private readonly resourceGroup: string;
  private readonly location: string;

  /**
   * Create a new ComputeService instance.
   *
   * @param subscriptionId - Azure subscription ID
   * @param resourceGroup - Resource group name
   * @param location - Azure region (e.g., "eastus")
   * @param credential - Optional TokenCredential (defaults to DefaultAzureCredential)
   */
  constructor(
    subscriptionId: string,
    resourceGroup: string,
    location: string,
    credential?: TokenCredential
  ) {
    const cred = credential || new DefaultAzureCredential();
    this.computeClient = new ComputeManagementClient(cred, subscriptionId);
    this.networkClient = new NetworkManagementClient(cred, subscriptionId);
    this.resourceGroup = resourceGroup;
    this.location = location;
  }

  // ------------------------------------------------------------------
  // VM Operations
  // ------------------------------------------------------------------

  /**
   * Create a VM instance.
   *
   * @param options - VM creation options
   * @returns Created VM resource
   */
  async createVm(options: CreateVmOptions): Promise<VirtualMachine> {
    const {
      vmName,
      nicId,
      diskId,
      vmSize,
      osDiskSizeGb,
      cloudInit,
      sshPublicKey,
      tags,
      adminUsername = "clawster",
      imagePublisher = "Canonical",
      imageOffer = "ubuntu-24_04-lts",
      imageSku = "server",
    } = options;

    const result = await this.computeClient.virtualMachines.beginCreateOrUpdateAndWait(
      this.resourceGroup,
      vmName,
      {
        location: this.location,
        hardwareProfile: {
          vmSize,
        },
        storageProfile: {
          imageReference: {
            publisher: imagePublisher,
            offer: imageOffer,
            sku: imageSku,
            version: "latest",
          },
          osDisk: {
            createOption: "FromImage",
            diskSizeGB: osDiskSizeGb,
            managedDisk: {
              storageAccountType: "Standard_LRS",
            },
            name: `${vmName}-osdisk`,
          },
          dataDisks: [
            {
              lun: 0,
              createOption: "Attach",
              managedDisk: {
                id: diskId,
              },
            },
          ],
        },
        osProfile: {
          computerName: vmName,
          adminUsername,
          customData: Buffer.from(cloudInit).toString("base64"),
          linuxConfiguration: {
            disablePasswordAuthentication: true,
            ssh: sshPublicKey
              ? {
                  publicKeys: [
                    {
                      path: `/home/${adminUsername}/.ssh/authorized_keys`,
                      keyData: sshPublicKey,
                    },
                  ],
                }
              : undefined,
          },
        },
        networkProfile: {
          networkInterfaces: [
            {
              id: nicId,
              primary: true,
            },
          ],
        },
        tags: {
          managedBy: "clawster",
          ...tags,
        },
      }
    );

    return result;
  }

  /**
   * Delete a VM.
   *
   * @param name - VM name
   */
  async deleteVm(name: string): Promise<void> {
    try {
      await this.computeClient.virtualMachines.beginDeleteAndWait(
        this.resourceGroup,
        name
      );
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        return; // Already deleted
      }
      throw error;
    }
  }

  /**
   * Start a VM.
   *
   * @param name - VM name
   */
  async startVm(name: string): Promise<void> {
    await this.computeClient.virtualMachines.beginStartAndWait(
      this.resourceGroup,
      name
    );
  }

  /**
   * Stop (deallocate) a VM.
   *
   * @param name - VM name
   */
  async stopVm(name: string): Promise<void> {
    await this.computeClient.virtualMachines.beginDeallocateAndWait(
      this.resourceGroup,
      name
    );
  }

  /**
   * Restart a VM.
   *
   * @param name - VM name
   */
  async restartVm(name: string): Promise<void> {
    await this.computeClient.virtualMachines.beginRestartAndWait(
      this.resourceGroup,
      name
    );
  }

  /**
   * Get VM power state.
   *
   * @param name - VM name
   * @returns VM status
   */
  async getVmStatus(name: string): Promise<VmStatus> {
    try {
      const instanceView = await this.computeClient.virtualMachines.instanceView(
        this.resourceGroup,
        name
      );

      const powerState = instanceView.statuses?.find(
        (s) => s.code?.startsWith("PowerState/")
      );

      const code = powerState?.code ?? "";

      if (code === "PowerState/running") {
        return "running";
      } else if (code === "PowerState/stopped") {
        return "stopped";
      } else if (code === "PowerState/deallocated") {
        return "deallocated";
      } else if (code === "PowerState/starting") {
        return "starting";
      } else if (code === "PowerState/stopping") {
        return "stopping";
      }
      return "unknown";
    } catch {
      return "unknown";
    }
  }

  /**
   * Get the VM private IP address.
   *
   * @param nicName - NIC name
   * @returns Private IP address or undefined
   */
  async getVmPrivateIp(nicName: string): Promise<string | undefined> {
    try {
      const nic = await this.networkClient.networkInterfaces.get(
        this.resourceGroup,
        nicName
      );
      return nic.ipConfigurations?.[0]?.privateIPAddress ?? undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Resize a VM.
   *
   * @param name - VM name
   * @param size - New VM size (e.g., "Standard_D2s_v3")
   */
  async resizeVm(name: string, size: string): Promise<void> {
    await this.computeClient.virtualMachines.beginUpdateAndWait(
      this.resourceGroup,
      name,
      {
        hardwareProfile: {
          vmSize: size,
        },
      }
    );
  }

  /**
   * Run a shell command on a VM using Run Command extension.
   *
   * @param vmName - VM name
   * @param script - Script lines to execute
   * @returns Command output
   */
  async runCommand(vmName: string, script: string[]): Promise<string> {
    const result: RunCommandResult = await this.computeClient.virtualMachines.beginRunCommandAndWait(
      this.resourceGroup,
      vmName,
      {
        commandId: "RunShellScript",
        script,
      }
    );

    return result.value?.[0]?.message ?? "";
  }

  // ------------------------------------------------------------------
  // NIC Operations
  // ------------------------------------------------------------------

  /**
   * Create a network interface.
   *
   * @param name - NIC name
   * @param subnetId - Subnet resource ID
   * @param publicIpId - Optional public IP resource ID
   * @returns Created NIC resource
   */
  async createNic(
    name: string,
    subnetId: string,
    publicIpId?: string
  ): Promise<NetworkInterface> {
    // Check if already exists
    try {
      const existing = await this.networkClient.networkInterfaces.get(
        this.resourceGroup,
        name
      );
      return existing;
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode !== 404) {
        throw error;
      }
    }

    const result = await this.networkClient.networkInterfaces.beginCreateOrUpdateAndWait(
      this.resourceGroup,
      name,
      {
        location: this.location,
        ipConfigurations: [
          {
            name: "ipconfig1",
            subnet: { id: subnetId },
            privateIPAllocationMethod: "Dynamic",
            publicIPAddress: publicIpId ? { id: publicIpId } : undefined,
          },
        ],
        tags: {
          managedBy: "clawster",
        },
      }
    );

    return result;
  }

  /**
   * Delete a network interface.
   *
   * @param name - NIC name
   */
  async deleteNic(name: string): Promise<void> {
    try {
      await this.networkClient.networkInterfaces.beginDeleteAndWait(
        this.resourceGroup,
        name
      );
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        return; // Already deleted
      }
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // Disk Operations
  // ------------------------------------------------------------------

  /**
   * Create a managed data disk.
   *
   * @param name - Disk name
   * @param sizeGb - Disk size in GB
   * @param sku - Disk SKU (default: "Standard_LRS")
   * @returns Created Disk resource
   */
  async createDataDisk(
    name: string,
    sizeGb: number,
    sku: string = "Standard_LRS"
  ): Promise<Disk> {
    // Check if already exists
    try {
      const existing = await this.computeClient.disks.get(
        this.resourceGroup,
        name
      );
      return existing;
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode !== 404) {
        throw error;
      }
    }

    const result = await this.computeClient.disks.beginCreateOrUpdateAndWait(
      this.resourceGroup,
      name,
      {
        location: this.location,
        sku: { name: sku },
        diskSizeGB: sizeGb,
        creationData: {
          createOption: "Empty",
        },
        tags: {
          managedBy: "clawster",
        },
      }
    );

    return result;
  }

  /**
   * Delete a managed disk.
   *
   * @param name - Disk name
   */
  async deleteDisk(name: string): Promise<void> {
    try {
      await this.computeClient.disks.beginDeleteAndWait(
        this.resourceGroup,
        name
      );
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        return; // Already deleted
      }
      throw error;
    }
  }

  /**
   * Resize a managed disk.
   * Note: Disk must be unattached or VM must be deallocated.
   *
   * @param name - Disk name
   * @param sizeGb - New size in GB (must be larger than current)
   */
  async resizeDisk(name: string, sizeGb: number): Promise<void> {
    await this.computeClient.disks.beginUpdateAndWait(
      this.resourceGroup,
      name,
      {
        diskSizeGB: sizeGb,
      }
    );
  }

  /**
   * Get disk information.
   *
   * @param name - Disk name
   * @returns Disk resource or undefined if not found
   */
  async getDisk(name: string): Promise<Disk | undefined> {
    try {
      return await this.computeClient.disks.get(this.resourceGroup, name);
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        return undefined;
      }
      throw error;
    }
  }

  /**
   * Get VM information.
   *
   * @param name - VM name
   * @returns VM resource or undefined if not found
   */
  async getVm(name: string): Promise<VirtualMachine | undefined> {
    try {
      return await this.computeClient.virtualMachines.get(
        this.resourceGroup,
        name
      );
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        return undefined;
      }
      throw error;
    }
  }
}
