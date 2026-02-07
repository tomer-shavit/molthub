/**
 * GCE Compute Manager
 *
 * Manages MIG (Managed Instance Group), Instance Templates, and Health Checks.
 * Caddy-on-VM architecture: MIG manages a single VM with auto-healing.
 */

import {
  InstancesClient,
  InstanceTemplatesClient,
  InstanceGroupManagersClient,
  HealthChecksClient,
} from "@google-cloud/compute";
import type { VmStatus, GceLogCallback } from "../types";
import type { IGceComputeManager, IGceOperationManager, InstanceTemplateConfig } from "./interfaces";

/**
 * Manages GCE compute resources using MIG for auto-healing.
 */
export class GceComputeManager implements IGceComputeManager {
  constructor(
    private readonly instancesClient: InstancesClient,
    private readonly templatesClient: InstanceTemplatesClient,
    private readonly migClient: InstanceGroupManagersClient,
    private readonly healthChecksClient: HealthChecksClient,
    private readonly operationManager: IGceOperationManager,
    private readonly project: string,
    private readonly zone: string,
    private readonly region: string,
    private readonly log: GceLogCallback
  ) {}

  // -- Instance Template --

  async createInstanceTemplate(config: InstanceTemplateConfig): Promise<string> {
    const metadataItems = [
      { key: "startup-script", value: config.startupScript },
      ...config.metadata,
    ];

    const [operation] = await this.templatesClient.insert({
      project: this.project,
      instanceTemplateResource: {
        name: config.name,
        description: "Clawster OpenClaw instance template",
        properties: {
          machineType: config.machineType,
          disks: [
            {
              boot: true,
              autoDelete: true,
              initializeParams: {
                sourceImage: config.sourceImage,
                diskSizeGb: String(config.bootDiskSizeGb),
                diskType: "pd-standard",
              },
            },
          ],
          networkInterfaces: [
            {
              network: `projects/${this.project}/global/networks/${config.networkName}`,
              subnetwork: `projects/${this.project}/regions/${this.region}/subnetworks/${config.subnetName}`,
              accessConfigs: [
                {
                  name: "External NAT",
                  type: "ONE_TO_ONE_NAT",
                  networkTier: "PREMIUM",
                },
              ],
            },
          ],
          tags: {
            items: config.networkTags,
          },
          metadata: {
            items: metadataItems,
          },
          labels: config.labels,
          serviceAccounts: [
            {
              scopes: config.scopes ?? [
                "https://www.googleapis.com/auth/cloud-platform",
              ],
            },
          ],
        },
      },
    });

    await this.operationManager.waitForOperation(operation, "global", {
      description: "create instance template",
    });

    const [template] = await this.templatesClient.get({
      project: this.project,
      instanceTemplate: config.name,
    });

    return template.selfLink ?? "";
  }

  async deleteInstanceTemplate(name: string): Promise<void> {
    try {
      const [operation] = await this.templatesClient.delete({
        project: this.project,
        instanceTemplate: name,
      });
      await this.operationManager.waitForOperation(operation, "global", {
        description: "delete instance template",
      });
    } catch (error: unknown) {
      if (!this.isNotFoundError(error)) throw error;
    }
  }

  // -- Health Check --

  async createHealthCheck(
    name: string,
    port: number,
    path: string
  ): Promise<string> {
    const [operation] = await this.healthChecksClient.insert({
      project: this.project,
      healthCheckResource: {
        name,
        description: "Clawster health check via Caddy",
        type: "HTTP",
        httpHealthCheck: {
          port,
          requestPath: path,
        },
        checkIntervalSec: 30,
        timeoutSec: 10,
        healthyThreshold: 2,
        unhealthyThreshold: 3,
      },
    });

    await this.operationManager.waitForOperation(operation, "global", {
      description: "create health check",
    });

    const [hc] = await this.healthChecksClient.get({
      project: this.project,
      healthCheck: name,
    });

    return hc.selfLink ?? "";
  }

  async deleteHealthCheck(name: string): Promise<void> {
    try {
      const [operation] = await this.healthChecksClient.delete({
        project: this.project,
        healthCheck: name,
      });
      await this.operationManager.waitForOperation(operation, "global", {
        description: "delete health check",
      });
    } catch (error: unknown) {
      if (!this.isNotFoundError(error)) throw error;
    }
  }

  // -- Managed Instance Group --

  async createMig(
    name: string,
    templateUrl: string,
    healthCheckUrl: string
  ): Promise<void> {
    const [operation] = await this.migClient.insert({
      project: this.project,
      zone: this.zone,
      instanceGroupManagerResource: {
        name,
        description: "Clawster MIG — single VM with auto-healing",
        instanceTemplate: templateUrl,
        targetSize: 1,
        autoHealingPolicies: [
          {
            healthCheck: healthCheckUrl,
            initialDelaySec: 600, // 10 min grace for startup script
          },
        ],
        updatePolicy: {
          type: "PROACTIVE",
          minimalAction: "REPLACE",
          maxSurge: { fixed: 1 },
          maxUnavailable: { fixed: 1 },
        },
      },
    });

    await this.operationManager.waitForOperation(operation, "zone", {
      description: "create MIG",
    });
  }

  async scaleMig(name: string, size: number): Promise<void> {
    const [operation] = await this.migClient.resize({
      project: this.project,
      zone: this.zone,
      instanceGroupManager: name,
      size,
    });

    await this.operationManager.waitForOperation(operation, "zone", {
      description: `scale MIG to ${size}`,
    });
  }

  async deleteMig(name: string): Promise<void> {
    try {
      const [operation] = await this.migClient.delete({
        project: this.project,
        zone: this.zone,
        instanceGroupManager: name,
      });
      await this.operationManager.waitForOperation(operation, "zone", {
        description: "delete MIG",
      });
    } catch (error: unknown) {
      if (!this.isNotFoundError(error)) throw error;
    }
  }

  async getMigInstanceIp(migName: string): Promise<string> {
    const instances = this.migClient.listManagedInstancesAsync({
      project: this.project,
      zone: this.zone,
      instanceGroupManager: migName,
    });

    for await (const instance of instances) {
      const instanceUrl = instance.instance;
      if (!instanceUrl) continue;

      const instanceName = instanceUrl.split("/").pop();
      if (!instanceName) continue;

      try {
        const [vm] = await this.instancesClient.get({
          project: this.project,
          zone: this.zone,
          instance: instanceName,
        });

        const natIp =
          vm.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP;
        if (natIp) return natIp;
      } catch {
        // Instance might not be ready yet
      }
    }

    return "";
  }

  async getMigStatus(
    migName: string
  ): Promise<"RUNNING" | "STOPPED" | "UNKNOWN"> {
    try {
      const [mig] = await this.migClient.get({
        project: this.project,
        zone: this.zone,
        instanceGroupManager: migName,
      });

      const targetSize =
        typeof mig.targetSize === "number" ? mig.targetSize : 0;

      if (targetSize === 0) return "STOPPED";

      // Check managed instances
      const instances = this.migClient.listManagedInstancesAsync({
        project: this.project,
        zone: this.zone,
        instanceGroupManager: migName,
      });

      for await (const instance of instances) {
        if (instance.instanceStatus === "RUNNING") return "RUNNING";
      }

      return "UNKNOWN";
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) return "STOPPED";
      throw error;
    }
  }

  async recreateMigInstances(migName: string): Promise<void> {
    const instanceUrls: string[] = [];

    const instances = this.migClient.listManagedInstancesAsync({
      project: this.project,
      zone: this.zone,
      instanceGroupManager: migName,
    });

    for await (const instance of instances) {
      if (instance.instance) {
        instanceUrls.push(instance.instance);
      }
    }

    if (instanceUrls.length === 0) return;

    const [operation] = await this.migClient.recreateInstances({
      project: this.project,
      zone: this.zone,
      instanceGroupManager: migName,
      instanceGroupManagersRecreateInstancesRequestResource: {
        instances: instanceUrls,
      },
    });

    await this.operationManager.waitForOperation(operation, "zone", {
      description: "recreate MIG instances",
    });
  }

  async setMigInstanceTemplate(
    migName: string,
    templateUrl: string
  ): Promise<void> {
    const [operation] = await this.migClient.setInstanceTemplate({
      project: this.project,
      zone: this.zone,
      instanceGroupManager: migName,
      instanceGroupManagersSetInstanceTemplateRequestResource: {
        instanceTemplate: templateUrl,
      },
    });

    await this.operationManager.waitForOperation(operation, "zone", {
      description: "update MIG instance template",
    });
  }

  async getMigInstanceTemplate(migName: string): Promise<string> {
    const [mig] = await this.migClient.get({
      project: this.project,
      zone: this.zone,
      instanceGroupManager: migName,
    });

    return mig.instanceTemplate ?? "";
  }

  // -- Direct instance operations --

  async getInstanceStatus(name: string): Promise<VmStatus> {
    const [instance] = await this.instancesClient.get({
      project: this.project,
      zone: this.zone,
      instance: name,
    });
    return (instance.status as VmStatus) ?? "UNKNOWN";
  }

  private isNotFoundError(error: unknown): boolean {
    return (
      error instanceof Error &&
      (error.message.includes("NOT_FOUND") || error.message.includes("404"))
    );
  }
}
