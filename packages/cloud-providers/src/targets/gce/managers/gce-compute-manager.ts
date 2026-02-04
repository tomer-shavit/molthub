/**
 * GCE Compute Manager
 *
 * Manages VM instances, disks, and instance groups.
 */

import {
  InstancesClient,
  DisksClient,
  InstanceGroupsClient,
} from "@google-cloud/compute";
import { GceOperationManager } from "./gce-operation-manager";
import type { VmInstanceConfig, NamedPort, VmStatus, GceLogCallback } from "../types";

/**
 * Manages GCE compute resources (VMs, disks, instance groups).
 */
export class GceComputeManager {
  constructor(
    private readonly instancesClient: InstancesClient,
    private readonly disksClient: DisksClient,
    private readonly instanceGroupsClient: InstanceGroupsClient,
    private readonly operationManager: GceOperationManager,
    private readonly project: string,
    private readonly zone: string,
    private readonly region: string,
    private readonly log: GceLogCallback
  ) {}

  /**
   * Create a new VM instance.
   *
   * @param config - VM instance configuration
   * @returns Instance self-link URL
   */
  async createVmInstance(config: VmInstanceConfig): Promise<string> {
    const disks: Array<Record<string, unknown>> = [
      {
        boot: true,
        autoDelete: true,
        initializeParams: {
          sourceImage: config.bootDisk.sourceImage,
          diskSizeGb: String(config.bootDisk.sizeGb),
          diskType: `zones/${this.zone}/diskTypes/${config.bootDisk.diskType}`,
        },
      },
    ];

    if (config.dataDiskName) {
      disks.push({
        boot: false,
        autoDelete: false,
        source: `zones/${this.zone}/disks/${config.dataDiskName}`,
        deviceName: config.dataDiskName,
      });
    }

    const [operation] = await this.instancesClient.insert({
      project: this.project,
      zone: this.zone,
      instanceResource: {
        name: config.name,
        machineType: `zones/${this.zone}/machineTypes/${config.machineType}`,
        description: `Clawster OpenClaw instance`,
        tags: {
          items: config.networkTags,
        },
        disks,
        networkInterfaces: [
          {
            network: `projects/${this.project}/global/networks/${config.networkName}`,
            subnetwork: `projects/${this.project}/regions/${this.region}/subnetworks/${config.subnetName}`,
            accessConfigs: [],
          },
        ],
        metadata: {
          items: config.metadata,
        },
        labels: config.labels,
        serviceAccounts: config.scopes
          ? [{ scopes: config.scopes }]
          : [{ scopes: ["https://www.googleapis.com/auth/cloud-platform"] }],
      },
    });

    await this.operationManager.waitForOperation(operation, "zone", {
      description: "create VM instance",
    });

    const [instance] = await this.instancesClient.get({
      project: this.project,
      zone: this.zone,
      instance: config.name,
    });

    return instance.selfLink ?? "";
  }

  /**
   * Update VM instance metadata.
   */
  async updateVmMetadata(
    instanceName: string,
    metadata: Record<string, string>
  ): Promise<void> {
    const [instance] = await this.instancesClient.get({
      project: this.project,
      zone: this.zone,
      instance: instanceName,
    });

    const currentItems = instance.metadata?.items ?? [];
    const metadataKeys = Object.keys(metadata);
    const newItems = currentItems.filter(
      (item) => item.key && !metadataKeys.includes(item.key)
    );

    for (const [key, value] of Object.entries(metadata)) {
      newItems.push({ key, value });
    }

    const [operation] = await this.instancesClient.setMetadata({
      project: this.project,
      zone: this.zone,
      instance: instanceName,
      metadataResource: {
        fingerprint: instance.metadata?.fingerprint,
        items: newItems,
      },
    });

    await this.operationManager.waitForOperation(operation, "zone", {
      description: "update VM metadata",
    });
  }

  /**
   * Ensure an unmanaged instance group exists with the specified instance.
   *
   * @param name - Instance group name
   * @param instanceName - VM instance to add to the group
   * @param namedPort - Named port for load balancing
   * @param vpcName - VPC network name
   * @returns Instance group self-link URL
   */
  async ensureInstanceGroup(
    name: string,
    instanceName: string,
    namedPort: NamedPort,
    vpcName: string
  ): Promise<string> {
    try {
      const [group] = await this.instanceGroupsClient.get({
        project: this.project,
        zone: this.zone,
        instanceGroup: name,
      });
      return group.selfLink ?? "";
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) {
        const [operation] = await this.instanceGroupsClient.insert({
          project: this.project,
          zone: this.zone,
          instanceGroupResource: {
            name,
            description: `Clawster instance group`,
            network: `projects/${this.project}/global/networks/${vpcName}`,
            namedPorts: [{ name: namedPort.name, port: namedPort.port }],
          },
        });
        await this.operationManager.waitForOperation(operation, "zone", {
          description: "create instance group",
        });

        const [addOperation] = await this.instanceGroupsClient.addInstances({
          project: this.project,
          zone: this.zone,
          instanceGroup: name,
          instanceGroupsAddInstancesRequestResource: {
            instances: [
              { instance: `zones/${this.zone}/instances/${instanceName}` },
            ],
          },
        });
        await this.operationManager.waitForOperation(addOperation, "zone", {
          description: "add instance to group",
        });

        const [group] = await this.instanceGroupsClient.get({
          project: this.project,
          zone: this.zone,
          instanceGroup: name,
        });
        return group.selfLink ?? "";
      }
      throw error;
    }
  }

  /**
   * Start a VM instance.
   */
  async startInstance(name: string): Promise<void> {
    const [operation] = await this.instancesClient.start({
      project: this.project,
      zone: this.zone,
      instance: name,
    });
    await this.operationManager.waitForOperation(operation, "zone", {
      description: "start VM",
    });
  }

  /**
   * Stop a VM instance.
   */
  async stopInstance(name: string): Promise<void> {
    const [operation] = await this.instancesClient.stop({
      project: this.project,
      zone: this.zone,
      instance: name,
    });
    await this.operationManager.waitForOperation(operation, "zone", {
      description: "stop VM",
    });
  }

  /**
   * Reset (restart) a VM instance.
   */
  async resetInstance(name: string): Promise<void> {
    const [operation] = await this.instancesClient.reset({
      project: this.project,
      zone: this.zone,
      instance: name,
    });
    await this.operationManager.waitForOperation(operation, "zone", {
      description: "reset VM",
    });
  }

  /**
   * Get the status of a VM instance.
   * Throws on NOT_FOUND so caller can detect "not-installed" state.
   */
  async getInstanceStatus(name: string): Promise<VmStatus> {
    const [instance] = await this.instancesClient.get({
      project: this.project,
      zone: this.zone,
      instance: name,
    });
    return (instance.status as VmStatus) ?? "UNKNOWN";
  }

  /**
   * Get VM instance details.
   */
  async getInstance(name: string): Promise<{
    status?: string | null;
    machineType?: string | null;
    metadata?: { items?: Array<{ key?: string | null; value?: string | null }> | null } | null;
  } | null> {
    try {
      const [instance] = await this.instancesClient.get({
        project: this.project,
        zone: this.zone,
        instance: name,
      });
      return instance as {
        status?: string | null;
        machineType?: string | null;
        metadata?: { items?: Array<{ key?: string | null; value?: string | null }> | null } | null;
      };
    } catch {
      return null;
    }
  }

  /**
   * Resize a VM instance (change machine type).
   * Note: VM must be stopped first.
   */
  async resizeInstance(name: string, machineType: string): Promise<void> {
    const [operation] = await this.instancesClient.setMachineType({
      project: this.project,
      zone: this.zone,
      instance: name,
      instancesSetMachineTypeRequestResource: {
        machineType: `zones/${this.zone}/machineTypes/${machineType}`,
      },
    });
    await this.operationManager.waitForOperation(operation, "zone", {
      description: "change machine type",
    });
  }

  /**
   * Ensure a data disk exists.
   */
  async ensureDataDisk(name: string, sizeGb: number, diskType = "pd-standard"): Promise<void> {
    try {
      await this.disksClient.get({
        project: this.project,
        zone: this.zone,
        disk: name,
      });
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) {
        const [operation] = await this.disksClient.insert({
          project: this.project,
          zone: this.zone,
          diskResource: {
            name,
            sizeGb: String(sizeGb),
            type: `zones/${this.zone}/diskTypes/${diskType}`,
            description: `Clawster persistent data disk`,
          },
        });
        await this.operationManager.waitForOperation(operation, "zone", {
          description: "create data disk",
        });
        return;
      }
      throw error;
    }
  }

  /**
   * Resize a disk (can only increase size).
   */
  async resizeDisk(name: string, sizeGb: number): Promise<void> {
    const [operation] = await this.disksClient.resize({
      project: this.project,
      zone: this.zone,
      disk: name,
      disksResizeRequestResource: {
        sizeGb: String(sizeGb),
      },
    });
    await this.operationManager.waitForOperation(operation, "zone", {
      description: "resize disk",
    });
  }

  /**
   * Get disk details.
   */
  async getDisk(name: string): Promise<{ sizeGb?: string | number | null } | null> {
    try {
      const [disk] = await this.disksClient.get({
        project: this.project,
        zone: this.zone,
        disk: name,
      });
      return disk as { sizeGb?: string | number | null };
    } catch {
      return null;
    }
  }

  /**
   * Delete a VM instance.
   */
  async deleteInstance(name: string): Promise<void> {
    try {
      const [operation] = await this.instancesClient.delete({
        project: this.project,
        zone: this.zone,
        instance: name,
      });
      await this.operationManager.waitForOperation(operation, "zone", {
        description: "delete VM",
      });
    } catch (error: unknown) {
      if (!this.isNotFoundError(error)) throw error;
    }
  }

  /**
   * Delete a disk.
   */
  async deleteDisk(name: string): Promise<void> {
    try {
      const [operation] = await this.disksClient.delete({
        project: this.project,
        zone: this.zone,
        disk: name,
      });
      await this.operationManager.waitForOperation(operation, "zone", {
        description: "delete disk",
      });
    } catch (error: unknown) {
      if (!this.isNotFoundError(error)) throw error;
    }
  }

  /**
   * Delete an instance group.
   */
  async deleteInstanceGroup(name: string): Promise<void> {
    try {
      const [operation] = await this.instanceGroupsClient.delete({
        project: this.project,
        zone: this.zone,
        instanceGroup: name,
      });
      await this.operationManager.waitForOperation(operation, "zone", {
        description: "delete instance group",
      });
    } catch (error: unknown) {
      if (!this.isNotFoundError(error)) throw error;
    }
  }

  private isNotFoundError(error: unknown): boolean {
    return (
      error instanceof Error &&
      (error.message.includes("NOT_FOUND") || error.message.includes("404"))
    );
  }
}
