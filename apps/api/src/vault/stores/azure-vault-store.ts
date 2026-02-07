import { createAzureKeyVaultService } from "@clawster/adapters-azure";
import type { AzureConfig } from "@clawster/adapters-azure";
import { sanitizeKeyVaultName } from "@clawster/adapters-common";
import type { IVaultSecretStore } from "../interfaces";

/**
 * Azure Key Vault implementation of IVaultSecretStore.
 * Secret name format: clawster-vault-{instanceId}-{key}
 */
export class AzureVaultStore implements IVaultSecretStore {
  private readonly service: ReturnType<typeof createAzureKeyVaultService>;

  constructor(config: AzureConfig) {
    this.service = createAzureKeyVaultService(config);
  }

  async storeSecret(instanceId: string, key: string, value: string): Promise<void> {
    const name = this.secretName(instanceId, key);
    const exists = await this.service.secretExists(name);

    if (exists) {
      await this.service.updateSecret(name, value);
    } else {
      await this.service.createSecret(name, value, {
        "clawster-instance-id": instanceId,
        "clawster-key": key,
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
    return sanitizeKeyVaultName(`clawster-vault-${instanceId}-${key}`);
  }
}
