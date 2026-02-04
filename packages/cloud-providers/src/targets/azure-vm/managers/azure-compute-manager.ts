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
   */
  async createNic(name: string, subnetId: string): Promise<NetworkInterface> {
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
                // No public IP - VM is only accessible via Application Gateway
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
   */
  async createVm(
    vmName: string,
    nicId: string,
    diskId: string,
    vmSize: string,
    osDiskSizeGb: number,
    cloudInit: string,
    sshPublicKey?: string,
    tags?: Record<string, string>
  ): Promise<VirtualMachine> {
    this.log(`  Creating VM: ${vmName}`);

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
            // Ubuntu 24.04 LTS
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

  /**
   * Start a VM.
   */
  async startVm(name: string): Promise<void> {
    this.log(`Starting VM: ${name}`);
    await this.computeClient.virtualMachines.beginStartAndWait(this.resourceGroup, name);
    this.log(`VM started`);
  }

  /**
   * Stop (deallocate) a VM.
   */
  async stopVm(name: string): Promise<void> {
    this.log(`Deallocating VM: ${name}`);
    await this.computeClient.virtualMachines.beginDeallocateAndWait(this.resourceGroup, name);
    this.log(`VM deallocated`);
  }

  /**
   * Restart a VM.
   */
  async restartVm(name: string): Promise<void> {
    this.log(`Restarting VM: ${name}`);
    await this.computeClient.virtualMachines.beginRestartAndWait(this.resourceGroup, name);
    this.log(`VM restarted`);
  }

  /**
   * Get VM power state.
   */
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
   * Resize a VM.
   */
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

  /**
   * Resize a managed disk.
   */
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

  /**
   * Run a shell script on a VM.
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

  /**
   * Delete a VM.
   */
  async deleteVm(name: string): Promise<void> {
    try {
      await this.computeClient.virtualMachines.beginDeleteAndWait(this.resourceGroup, name);
      this.log(`VM deleted: ${name}`);
    } catch {
      this.log(`VM not found (skipped): ${name}`);
    }
  }

  /**
   * Delete a NIC.
   */
  async deleteNic(name: string): Promise<void> {
    try {
      await this.networkClient.networkInterfaces.beginDeleteAndWait(this.resourceGroup, name);
      this.log(`NIC deleted: ${name}`);
    } catch {
      this.log(`NIC not found (skipped): ${name}`);
    }
  }

  /**
   * Delete a disk.
   */
  async deleteDisk(name: string): Promise<void> {
    try {
      await this.computeClient.disks.beginDeleteAndWait(this.resourceGroup, name);
      this.log(`Disk deleted: ${name}`);
    } catch {
      this.log(`Disk not found (skipped): ${name}`);
    }
  }

  /**
   * Get VM private IP address from NIC.
   */
  async getVmPrivateIp(nicName: string): Promise<string | undefined> {
    try {
      const nic = await this.networkClient.networkInterfaces.get(this.resourceGroup, nicName);
      return nic.ipConfigurations?.[0]?.privateIPAddress ?? undefined;
    } catch {
      return undefined;
    }
  }
}
