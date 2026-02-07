import { createSecretsManagerService } from "@clawster/adapters-aws";
import { sanitizeAwsName } from "@clawster/adapters-common";
import type { IVaultSecretStore } from "../interfaces";

/**
 * AWS Secrets Manager implementation of IVaultSecretStore.
 * Secret name format: clawster/vault/{instanceId}/{key}
 */
export class AwsVaultStore implements IVaultSecretStore {
  private readonly service: ReturnType<typeof createSecretsManagerService>;

  constructor(region: string) {
    this.service = createSecretsManagerService(region);
  }

  async storeSecret(instanceId: string, key: string, value: string): Promise<void> {
    const name = this.secretName(instanceId, key);
    const exists = await this.service.secretExists(name);

    if (exists) {
      await this.service.updateSecret(name, value);
    } else {
      await this.service.createSecret(name, value, {
        "clawster:instanceId": instanceId,
        "clawster:key": key,
      });
    }
  }

  async getSecret(instanceId: string, key: string): Promise<string | undefined> {
    const name = this.secretName(instanceId, key);
    return this.service.getSecret(name);
  }

  async deleteSecret(instanceId: string, key: string): Promise<void> {
    const name = this.secretName(instanceId, key);
    const exists = await this.service.secretExists(name);
    if (exists) {
      await this.service.deleteSecret(name, true);
    }
  }

  private secretName(instanceId: string, key: string): string {
    return sanitizeAwsName(`clawster/vault/${instanceId}/${key}`);
  }
}
