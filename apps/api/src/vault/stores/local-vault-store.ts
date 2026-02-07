import type { PrismaClient } from "@clawster/database";
import type { CredentialEncryptionService } from "../../connectors/credential-encryption.service";
import type { IVaultSecretStore } from "../interfaces";

/**
 * Local/Docker fallback vault store using Prisma + AES-256 encryption.
 * Stores encrypted secrets in the BotVaultSecret table.
 */
export class LocalVaultStore implements IVaultSecretStore {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly encryption: CredentialEncryptionService,
  ) {}

  async storeSecret(instanceId: string, key: string, value: string): Promise<void> {
    const encryptedValue = this.encryption.encrypt({ value });

    await this.prisma.botVaultSecret.upsert({
      where: { botInstanceId_key: { botInstanceId: instanceId, key } },
      create: { botInstanceId: instanceId, key, encryptedValue },
      update: { encryptedValue },
    });
  }

  async getSecret(instanceId: string, key: string): Promise<string | undefined> {
    const record = await this.prisma.botVaultSecret.findUnique({
      where: { botInstanceId_key: { botInstanceId: instanceId, key } },
    });

    if (!record) return undefined;

    const decrypted = this.encryption.decrypt(record.encryptedValue);
    return decrypted.value as string;
  }

  async deleteSecret(instanceId: string, key: string): Promise<void> {
    await this.prisma.botVaultSecret.deleteMany({
      where: { botInstanceId: instanceId, key },
    });
  }
}
