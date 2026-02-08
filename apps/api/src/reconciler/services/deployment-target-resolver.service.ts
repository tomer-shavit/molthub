import * as path from "path";
import { Injectable, Inject, Logger } from "@nestjs/common";
import { BotInstance, PRISMA_CLIENT } from "@clawster/database";
import type { PrismaClient } from "@clawster/database";
import {
  DeploymentTargetFactory,
  DeploymentTargetType,
  AdapterRegistry,
} from "@clawster/cloud-providers";
import type {
  DeploymentTarget,
  DeploymentTargetConfig,
} from "@clawster/cloud-providers";
import type { IDeploymentTargetResolver } from "../interfaces/deployment-target-resolver.interface";

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * DeploymentTargetResolverService — resolves deployment targets and type mappings.
 *
 * Single Responsibility: Resolve deployment targets from DB or instance metadata,
 * and convert between deployment type strings and enums.
 *
 * Extracted from LifecycleManagerService to follow SRP.
 */
@Injectable()
export class DeploymentTargetResolverService implements IDeploymentTargetResolver {
  private readonly logger = new Logger(DeploymentTargetResolverService.name);

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
  ) {}

  /**
   * Map a BotInstance's deploymentType enum to the string format used by
   * the adapter registry (e.g., "LOCAL" → "local", "ECS_EC2" → "ecs-ec2").
   * Falls back to the DeploymentTarget DB record's type when the instance's
   * deploymentType is not set but deploymentTargetId is.
   */
  async resolveDeploymentType(instance: BotInstance): Promise<string> {
    const typeMap: Record<string, string> = {
      LOCAL: "local",
      DOCKER: "docker",
      ECS_EC2: "ecs-ec2",
      GCE: "gce",
      AZURE_VM: "azure-vm",
    };

    if (instance.deploymentType) {
      return typeMap[instance.deploymentType] ?? "docker";
    }

    // Fall back to DB target type when deploymentType is not set on instance
    if (instance.deploymentTargetId) {
      const dbTarget = await this.prisma.deploymentTarget.findUnique({
        where: { id: instance.deploymentTargetId },
        select: { type: true },
      });
      if (dbTarget) {
        return typeMap[dbTarget.type] ?? "docker";
      }
    }

    return "local";
  }

  /**
   * Get the install step ID from the adapter registry for a deployment type.
   */
  getInstallStepId(deploymentType: string): string {
    const typeEnum = this.stringToDeploymentTargetType(deploymentType);
    if (!typeEnum) {
      throw new Error(`Unknown deployment type: ${deploymentType}`);
    }

    const stepId = AdapterRegistry.getInstance().getOperationStepId(typeEnum, "install");
    if (!stepId) {
      throw new Error(
        `No install step ID found for deployment type "${deploymentType}". ` +
        `Ensure the adapter's getMetadata() defines operationSteps.install.`
      );
    }

    return stepId;
  }

  /**
   * Get the post-install step ID from the adapter registry for a deployment type.
   */
  getPostInstallStepId(deploymentType: string): string | undefined {
    const typeEnum = this.stringToDeploymentTargetType(deploymentType);
    if (!typeEnum) return undefined;
    return AdapterRegistry.getInstance().getOperationStepId(typeEnum, "postInstall");
  }

  /**
   * Get the configure step ID from the adapter registry for a deployment type.
   */
  getConfigureStepId(deploymentType: string): string | undefined {
    const typeEnum = this.stringToDeploymentTargetType(deploymentType);
    if (!typeEnum) return undefined;
    return AdapterRegistry.getInstance().getOperationStepId(typeEnum, "configure");
  }

  /**
   * Get the start step ID from the adapter registry for a deployment type.
   */
  getStartStepId(deploymentType: string): string {
    const typeEnum = this.stringToDeploymentTargetType(deploymentType);
    if (!typeEnum) {
      throw new Error(`Unknown deployment type: ${deploymentType}`);
    }

    const stepId = AdapterRegistry.getInstance().getOperationStepId(typeEnum, "start");
    if (!stepId) {
      throw new Error(
        `No start step ID found for deployment type "${deploymentType}". ` +
        `Ensure the adapter's getMetadata() defines operationSteps.start.`
      );
    }

    return stepId;
  }

  /**
   * Convert a deployment type string (e.g., "docker", "ecs-ec2") to the
   * corresponding DeploymentTargetType enum value.
   */
  stringToDeploymentTargetType(type: string): DeploymentTargetType | undefined {
    const typeMap: Record<string, DeploymentTargetType> = {
      local: DeploymentTargetType.LOCAL,
      docker: DeploymentTargetType.DOCKER,
      "ecs-ec2": DeploymentTargetType.ECS_EC2,
      gce: DeploymentTargetType.GCE,
      "azure-vm": DeploymentTargetType.AZURE_VM,
    };
    return typeMap[type];
  }

  /**
   * Resolve the DeploymentTarget implementation for a BotInstance.
   * Uses the DeploymentTarget DB record if present, otherwise falls back
   * to deriving from deploymentType enum.
   */
  async resolveTarget(instance: BotInstance): Promise<DeploymentTarget> {
    if (instance.deploymentTargetId) {
      const dbTarget = await this.prisma.deploymentTarget.findUnique({
        where: { id: instance.deploymentTargetId },
      });

      if (dbTarget) {
        const targetConfig = this.mapDbTargetToConfig(dbTarget, instance);
        return DeploymentTargetFactory.create(targetConfig);
      }
    }

    // Fallback: derive from deploymentType enum
    const config = this.buildConfigFromInstance(instance);
    return DeploymentTargetFactory.create(config);
  }

  /**
   * Map a Prisma DeploymentTarget row to the typed config union that the
   * factory expects.
   */
  private mapDbTargetToConfig(
    dbTarget: { type: string; config: unknown },
    instance?: BotInstance,
  ): DeploymentTargetConfig {
    const cfg = (typeof dbTarget.config === "string"
      ? JSON.parse(dbTarget.config)
      : dbTarget.config ?? {}) as Record<string, unknown>;

    switch (dbTarget.type) {
      case "LOCAL":
        return { type: "local" };
      case "DOCKER":
        return {
          type: "docker",
          docker: {
            containerName: (cfg.containerName as string) ?? "openclaw",
            imageName: (cfg.imageName as string) ?? "openclaw:local",
            dockerfilePath: (cfg.dockerfilePath as string) ?? path.join(__dirname, "../../../../../../docker/openclaw"),
            configPath: (cfg.configPath as string) ?? "/var/openclaw",
            gatewayPort: (cfg.gatewayPort as number) ?? 18789,
            networkName: cfg.networkName as string | undefined,
          },
        };
      case "ECS_EC2":
        return {
          type: "ecs-ec2",
          ecs: {
            region: (cfg.region as string) ?? "us-east-1",
            accessKeyId: (cfg.accessKeyId as string) ?? "",
            secretAccessKey: (cfg.secretAccessKey as string) ?? "",
            profileName: instance?.profileName ?? instance?.name,
            customDomain: cfg.customDomain as string | undefined,
            instanceType: cfg.instanceType as string | undefined,
          },
        };
      case "GCE":
        return {
          type: "gce",
          gce: {
            projectId: (cfg.projectId as string) ?? "",
            zone: (cfg.zone as string) ?? "us-central1-a",
            keyFilePath: cfg.keyFilePath as string | undefined,
            machineType: cfg.machineType as string | undefined,
            profileName: instance?.profileName ?? instance?.name,
          },
        };
      case "AZURE_VM":
        return {
          type: "azure-vm",
          azureVm: {
            subscriptionId: (cfg.subscriptionId as string) ?? "",
            resourceGroup: (cfg.resourceGroup as string) ?? "",
            region: (cfg.region as string) ?? "eastus",
            clientId: cfg.clientId as string | undefined,
            clientSecret: cfg.clientSecret as string | undefined,
            tenantId: cfg.tenantId as string | undefined,
            vmSize: cfg.vmSize as string | undefined,
            osDiskSizeGb: cfg.osDiskSizeGb as number | undefined,
            sshPublicKey: cfg.sshPublicKey as string | undefined,
            customDomain: cfg.customDomain as string | undefined,
            storageAccountName: cfg.storageAccountName as string | undefined,
            shareName: cfg.shareName as string | undefined,
            managedIdentityClientId: cfg.managedIdentityClientId as string | undefined,
            keyVaultName: cfg.keyVaultName as string | undefined,
            logAnalyticsWorkspaceId: cfg.logAnalyticsWorkspaceId as string | undefined,
            logAnalyticsWorkspaceKey: cfg.logAnalyticsWorkspaceKey as string | undefined,
            profileName: instance?.profileName ?? instance?.name,
          },
        };
      default:
        return { type: "local" };
    }
  }

  /**
   * Build a DeploymentTargetConfig from instance metadata when no DB target exists.
   */
  private buildConfigFromInstance(instance: BotInstance): DeploymentTargetConfig {
    const typeStr = instance.deploymentType ?? "LOCAL";
    const instanceMeta = (typeof instance.metadata === "string"
      ? JSON.parse(instance.metadata)
      : instance.metadata) as Record<string, unknown> | null;

    const configMap: Record<string, DeploymentTargetConfig> = {
      LOCAL: { type: "local" },
      DOCKER: {
        type: "docker",
        docker: {
          containerName: `openclaw-${instance.name}`,
          imageName: "openclaw:local",
          dockerfilePath: path.join(__dirname, "../../../../../../docker/openclaw"),
          configPath: `/var/openclaw/${instance.name}`,
          gatewayPort: instance.gatewayPort ?? 18789,
        },
      },
      ECS_EC2: {
        type: "ecs-ec2",
        ecs: {
          region: (instanceMeta?.region as string) ?? (instanceMeta?.awsRegion as string) ?? "us-east-1",
          accessKeyId: (instanceMeta?.accessKeyId as string) ?? (instanceMeta?.awsAccessKeyId as string) ?? "",
          secretAccessKey: (instanceMeta?.secretAccessKey as string) ?? (instanceMeta?.awsSecretAccessKey as string) ?? "",
          profileName: instance.profileName ?? instance.name,
          customDomain: instanceMeta?.customDomain as string | undefined,
          instanceType: instanceMeta?.instanceType as string | undefined,
        },
      },
      GCE: {
        type: "gce",
        gce: {
          projectId: (instanceMeta?.projectId as string) ?? (instanceMeta?.gcpProjectId as string) ?? "",
          zone: (instanceMeta?.zone as string) ?? (instanceMeta?.gcpZone as string) ?? "us-central1-a",
          keyFilePath: instanceMeta?.keyFilePath as string | undefined,
          machineType: instanceMeta?.machineType as string | undefined,
          profileName: instance.profileName ?? instance.name,
        },
      },
      AZURE_VM: {
        type: "azure-vm",
        azureVm: {
          subscriptionId: (instanceMeta?.subscriptionId as string) ?? (instanceMeta?.azureSubscriptionId as string) ?? "",
          resourceGroup: (instanceMeta?.resourceGroup as string) ?? (instanceMeta?.azureResourceGroup as string) ?? "",
          region: (instanceMeta?.region as string) ?? (instanceMeta?.azureRegion as string) ?? "eastus",
          clientId: instanceMeta?.clientId as string | undefined,
          clientSecret: instanceMeta?.clientSecret as string | undefined,
          tenantId: instanceMeta?.tenantId as string | undefined,
          vmSize: instanceMeta?.vmSize as string | undefined,
          osDiskSizeGb: instanceMeta?.osDiskSizeGb as number | undefined,
          sshPublicKey: instanceMeta?.sshPublicKey as string | undefined,
          customDomain: instanceMeta?.customDomain as string | undefined,
          storageAccountName: instanceMeta?.storageAccountName as string | undefined,
          shareName: instanceMeta?.shareName as string | undefined,
          managedIdentityClientId: instanceMeta?.managedIdentityClientId as string | undefined,
          keyVaultName: instanceMeta?.keyVaultName as string | undefined,
          logAnalyticsWorkspaceId: instanceMeta?.logAnalyticsWorkspaceId as string | undefined,
          logAnalyticsWorkspaceKey: instanceMeta?.logAnalyticsWorkspaceKey as string | undefined,
          profileName: instance.profileName ?? instance.name,
        },
      },
    };

    return configMap[typeStr] ?? { type: "local" as const };
  }
}
