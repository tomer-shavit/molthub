import { createSecretManagerService } from "@clawster/adapters-gcp";
import type { GcpConfig } from "@clawster/adapters-gcp";
import { sanitizeGcpSecretName } from "@clawster/adapters-common";
import type { IVaultSecretStore } from "../interfaces";

/**
 * GCP Secret Manager implementation of IVaultSecretStore.
 * Secret name format: clawster-vault-{instanceId}-{key}
 */
export class GceVaultStore implements IVaultSecretStore {
  private readonly service: ReturnType<typeof createSecretManagerService>;

  constructor(config: GcpConfig) {
    this.service = createSecretManagerService(config);
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
      await this.service.deleteSecret(name);
    }
  }

  private secretName(instanceId: string, key: string): string {
    return sanitizeGcpSecretName(`clawster-vault-${instanceId}-${key}`);
  }
}
