import { Injectable, Inject, Logger } from "@nestjs/common";
import {
  BOT_INSTANCE_REPOSITORY,
  IBotInstanceRepository,
  PRISMA_CLIENT,
} from "@clawster/database";
import type { PrismaClient } from "@clawster/database";
import { CredentialEncryptionService } from "../connectors/credential-encryption.service";
import type { IVaultSecretStore } from "./interfaces";
import { AwsVaultStore } from "./stores/aws-vault-store";
import { GceVaultStore } from "./stores/gce-vault-store";
import { AzureVaultStore } from "./stores/azure-vault-store";
import { LocalVaultStore } from "./stores/local-vault-store";

/**
 * VaultService — business logic for storing/retrieving secrets
 * across cloud providers.
 *
 * Single Responsibility: Route vault operations to the correct
 * cloud provider store based on the bot's deployment type.
 */
@Injectable()
export class VaultService {
  private readonly logger = new Logger(VaultService.name);

  constructor(
    @Inject(BOT_INSTANCE_REPOSITORY) private readonly botInstanceRepo: IBotInstanceRepository,
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly encryption: CredentialEncryptionService,
  ) {}

  async storeSecret(instanceId: string, key: string, value: string): Promise<void> {
    const store = await this.resolveStore(instanceId);
    await store.storeSecret(instanceId, key, value);
    this.logger.log(`Stored secret "${key}" for instance ${instanceId}`);
  }

  async getSecret(instanceId: string, key: string): Promise<string | undefined> {
    const store = await this.resolveStore(instanceId);
    return store.getSecret(instanceId, key);
  }

  async deleteSecret(instanceId: string, key: string): Promise<void> {
    const store = await this.resolveStore(instanceId);
    await store.deleteSecret(instanceId, key);
    this.logger.log(`Deleted secret "${key}" for instance ${instanceId}`);
  }

  /**
   * Resolve the appropriate vault store based on the bot's deployment type
   * and cloud credentials.
   */
  private async resolveStore(instanceId: string): Promise<IVaultSecretStore> {
    const instance = await this.botInstanceRepo.findById(instanceId);
    if (!instance) {
      throw new Error(`BotInstance ${instanceId} not found`);
    }

    const deploymentType = instance.deploymentType ?? "LOCAL";

    // Parse credentials from deployment target or instance metadata
    const cfg = await this.getCloudConfig(instance);

    switch (deploymentType) {
      case "ECS_EC2":
        return new AwsVaultStore(cfg.region ?? "us-east-1");

      case "GCE":
        return new GceVaultStore({
          projectId: cfg.projectId ?? "",
          keyFilename: cfg.keyFilePath,
        });

      case "AZURE_VM":
        return new AzureVaultStore({
          subscriptionId: cfg.subscriptionId ?? "",
          resourceGroup: cfg.resourceGroup ?? "",
          keyVaultName: cfg.keyVaultName ?? "clawster-vault",
        });

      case "LOCAL":
      case "DOCKER":
      default:
        return new LocalVaultStore(this.prisma, this.encryption);
    }
  }

  /**
   * Extract cloud credentials from the DeploymentTarget DB record
   * or fall back to instance metadata.
   */
  private async getCloudConfig(
    instance: { id: string; deploymentTargetId?: string | null; metadata?: unknown },
  ): Promise<Record<string, string | undefined>> {
    // Try deployment target first
    if (instance.deploymentTargetId) {
      const dbTarget = await this.prisma.deploymentTarget.findUnique({
        where: { id: instance.deploymentTargetId },
      });

      if (dbTarget) {
        const cfg = (typeof dbTarget.config === "string"
          ? JSON.parse(dbTarget.config)
          : dbTarget.config ?? {}) as Record<string, unknown>;
        return this.extractConfigFields(cfg);
      }
    }

    // Fall back to instance metadata
    const meta = (typeof instance.metadata === "string"
      ? JSON.parse(instance.metadata as string)
      : instance.metadata ?? {}) as Record<string, unknown>;
    return this.extractConfigFields(meta);
  }

  private extractConfigFields(cfg: Record<string, unknown>): Record<string, string | undefined> {
    return {
      region: (cfg.region as string) ?? (cfg.awsRegion as string),
      projectId: (cfg.projectId as string) ?? (cfg.gcpProjectId as string),
      keyFilePath: cfg.keyFilePath as string | undefined,
      keyVaultName: cfg.keyVaultName as string | undefined,
      subscriptionId: (cfg.subscriptionId as string) ?? (cfg.azureSubscriptionId as string),
      resourceGroup: (cfg.resourceGroup as string) ?? (cfg.azureResourceGroup as string),
    };
  }
}
