/**
 * Azure Compute Manager
 *
 * Handles VM, Disk, and NIC operations for Azure VM deployments.
 */

import type { ComputeManagementClient, VirtualMachine, Disk, RunCommandResult } from "@azure/arm-compute";
import type { NetworkManagementClient, NetworkInterface } from "@azure/arm-network";
import type { VmStatus, AzureLogCallback } from "../types";
import type { IAzureComputeManager } from "./interfaces";

export class AzureComputeManager implements IAzureComputeManager {
  constructor(
    private readonly computeClient: ComputeManagementClient,
    private readonly networkClient: NetworkManagementClient,
    private readonly resourceGroup: string,
    private readonly location: string,
    private readonly log: AzureLogCallback
  ) {}

  /**
   * Create a managed data disk.
   */
  async createDataDisk(name: string, sizeGb: number): Promise<Disk> {
    try {
      const existing = await this.computeClient.disks.get(this.resourceGroup, name);
      return existing;
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        this.log(`  Creating data disk: ${name} (${sizeGb}GB)`);
        const result = await this.computeClient.disks.beginCreateOrUpdateAndWait(
          this.resourceGroup,
          name,
          {
            location: this.location,
            sku: { name: "Standard_LRS" },
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
      throw error;
    }
  }

  /**
   * Create a network interface.
   * @param publicIpId - Optional public IP resource ID to attach
   */
  async createNic(name: string, subnetId: string, publicIpId?: string): Promise<NetworkInterface> {
    try {
      const existing = await this.networkClient.networkInterfaces.get(this.resourceGroup, name);
      return existing;
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        this.log(`  Creating NIC: ${name}`);
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
                ...(publicIpId ? { publicIPAddress: { id: publicIpId } } : {}),
              },
            ],
            tags: {
              managedBy: "clawster",
            },
          }
        );
        return result;
      }
      throw error;
    }
  }

  /**
   * Create a VM instance.
   * @param diskId - Data disk resource ID (undefined = no data disk attached)
   */
  async createVm(
    vmName: string,
    nicId: string,
    diskId: string | undefined,
    vmSize: string,
    osDiskSizeGb: number,
    cloudInit: string,
    sshPublicKey?: string,
    tags?: Record<string, string>,
    userAssignedIdentityId?: string
  ): Promise<VirtualMachine> {
    this.log(`  Creating VM: ${vmName}`);

    const dataDisks = diskId
      ? [
          {
            lun: 0,
            createOption: "Attach" as const,
            managedDisk: { id: diskId },
          },
        ]
      : [];

    const identity = userAssignedIdentityId
      ? {
          type: "UserAssigned" as const,
          userAssignedIdentities: { [userAssignedIdentityId]: {} },
        }
      : undefined;

    const result = await this.computeClient.virtualMachines.beginCreateOrUpdateAndWait(
      this.resourceGroup,
      vmName,
      {
        location: this.location,
        identity,
        hardwareProfile: {
          vmSize,
        },
        storageProfile: {
          imageReference: {
            publisher: "Canonical",
            offer: "ubuntu-24_04-lts",
            sku: "server",
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
          dataDisks,
        },
        osProfile: {
          computerName: vmName,
          adminUsername: "clawster",
          customData: Buffer.from(cloudInit).toString("base64"),
          linuxConfiguration: {
            disablePasswordAuthentication: true,
            ssh: sshPublicKey
              ? {
                  publicKeys: [
                    {
                      path: "/home/clawster/.ssh/authorized_keys",
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

  async startVm(name: string): Promise<void> {
    this.log(`Starting VM: ${name}`);
    await this.computeClient.virtualMachines.beginStartAndWait(this.resourceGroup, name);
    this.log(`VM started`);
  }

  async stopVm(name: string): Promise<void> {
    this.log(`Deallocating VM: ${name}`);
    await this.computeClient.virtualMachines.beginDeallocateAndWait(this.resourceGroup, name);
    this.log(`VM deallocated`);
  }

  async restartVm(name: string): Promise<void> {
    this.log(`Restarting VM: ${name}`);
    await this.computeClient.virtualMachines.beginRestartAndWait(this.resourceGroup, name);
    this.log(`VM restarted`);
  }

  async getVmStatus(name: string): Promise<VmStatus> {
    try {
      const instanceView = await this.computeClient.virtualMachines.instanceView(
        this.resourceGroup,
        name
      );

      const powerState = instanceView.statuses?.find(
        (s: { code?: string }) => s.code?.startsWith("PowerState/")
      );

      const code = powerState?.code ?? "";

      if (code === "PowerState/running") return "running";
      if (code === "PowerState/stopped") return "stopped";
      if (code === "PowerState/deallocated") return "deallocated";
      if (code === "PowerState/starting") return "starting";
      if (code === "PowerState/stopping") return "stopping";
      return "unknown";
    } catch {
      return "unknown";
    }
  }

  async resizeVm(name: string, size: string): Promise<void> {
    this.log(`Resizing VM to: ${size}`);
    await this.computeClient.virtualMachines.beginUpdateAndWait(
      this.resourceGroup,
      name,
      {
        hardwareProfile: {
          vmSize: size,
        },
      }
    );
    this.log(`VM resized`);
  }

  async resizeDisk(name: string, sizeGb: number): Promise<void> {
    this.log(`Resizing disk to: ${sizeGb}GB`);
    await this.computeClient.disks.beginUpdateAndWait(
      this.resourceGroup,
      name,
      {
        diskSizeGB: sizeGb,
      }
    );
    this.log(`Disk resized`);
  }

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

  async deleteVm(name: string): Promise<void> {
    try {
      await this.computeClient.virtualMachines.beginDeleteAndWait(this.resourceGroup, name);
      this.log(`VM deleted: ${name}`);
    } catch {
      this.log(`VM not found (skipped): ${name}`);
    }
  }

  async deleteNic(name: string): Promise<void> {
    try {
      await this.networkClient.networkInterfaces.beginDeleteAndWait(this.resourceGroup, name);
      this.log(`NIC deleted: ${name}`);
    } catch {
      this.log(`NIC not found (skipped): ${name}`);
    }
  }

  async deleteDisk(name: string): Promise<void> {
    try {
      await this.computeClient.disks.beginDeleteAndWait(this.resourceGroup, name);
      this.log(`Disk deleted: ${name}`);
    } catch {
      this.log(`Disk not found (skipped): ${name}`);
    }
  }

  async getVmPrivateIp(nicName: string): Promise<string | undefined> {
    try {
      const nic = await this.networkClient.networkInterfaces.get(this.resourceGroup, nicName);
      return nic.ipConfigurations?.[0]?.privateIPAddress ?? undefined;
    } catch {
      return undefined;
    }
  }
}
