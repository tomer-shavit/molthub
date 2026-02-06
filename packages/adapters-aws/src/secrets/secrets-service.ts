/**
 * Secrets Manager Service Facade
 *
 * Unified facade implementing ISecretsService by composing focused services.
 * Each focused service handles a single responsibility:
 * - SecretCrudService: Basic CRUD operations
 * - InstanceProvisioningService: Bulk provisioning for bot instances
 */

import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import type { ISecretsService } from "@clawster/adapters-common";
import { SecretCrudService } from "./services/secret-crud-service";
import { InstanceProvisioningService } from "./services/instance-provisioning-service";

export interface SecretValue {
  name: string;
  value: string;
  arn?: string;
}

export interface SecretsManagerServiceOptions {
  /** Prefix pattern for instance secrets. Default: "/clawster" */
  prefix?: string;
  /** AWS region for ARN construction. Default: process.env.AWS_REGION || "us-east-1" */
  region?: string;
  /** AWS account ID for ARN construction. Default: process.env.AWS_ACCOUNT_ID || "" */
  accountId?: string;
}

/**
 * AWS Secrets Manager service implementing ISecretsService.
 * Composes focused services following Single Responsibility Principle.
 */
export class SecretsManagerService implements ISecretsService {
  private readonly crudService: SecretCrudService;
  private readonly provisioningService: InstanceProvisioningService;

  constructor(
    private readonly client: SecretsManagerClient,
    options: SecretsManagerServiceOptions = {}
  ) {
    const region = options.region ?? process.env.AWS_REGION ?? "us-east-1";

    this.crudService = new SecretCrudService(client);
    this.provisioningService = new InstanceProvisioningService(client, {
      prefix: options.prefix,
      region,
      accountId: options.accountId,
    });
  }

  // --- ISecretReader ---

  async getSecret(name: string): Promise<string | undefined> {
    return this.crudService.getSecret(name);
  }

  async secretExists(name: string): Promise<boolean> {
    return this.crudService.secretExists(name);
  }

  // --- ISecretWriter ---

  async createSecret(
    name: string,
    value: string,
    tags?: Record<string, string>
  ): Promise<string> {
    return this.crudService.createSecret(name, value, tags);
  }

  async updateSecret(name: string, value: string): Promise<void> {
    return this.crudService.updateSecret(name, value);
  }

  async deleteSecret(name: string, forceDelete: boolean = false): Promise<void> {
    return this.crudService.deleteSecret(name, forceDelete);
  }

  // --- Describe ---

  async describeSecret(secretId: string): Promise<{ arn: string }> {
    return this.crudService.describeSecret(secretId);
  }

  // --- ISecretProvisioner ---

  async ensureSecretsForInstance(
    workspace: string,
    instanceName: string,
    secrets: Record<string, string>
  ): Promise<Record<string, string>> {
    return this.provisioningService.ensureSecretsForInstance(
      workspace,
      instanceName,
      secrets
    );
  }
}

/**
 * Factory function to create a SecretsManagerService.
 */
export function createSecretsManagerService(
  region: string = "us-east-1",
  options: SecretsManagerServiceOptions = {}
): SecretsManagerService {
  return new SecretsManagerService(new SecretsManagerClient({ region }), {
    ...options,
    region,
  });
}
