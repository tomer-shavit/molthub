import { SecretsManagerClient, DescribeSecretCommand, TagResourceCommand, UpdateSecretCommand, ListSecretsCommand } from "@aws-sdk/client-secrets-manager";

export interface StaleSecret {
  name: string;
  lastRotated: Date;
  ageDays: number;
}

export class TokenRotationService {
  private readonly client: SecretsManagerClient;

  constructor() {
    this.client = new SecretsManagerClient({});
  }

  /**
   * Rotate a secret by updating its value and setting the lastRotated tag.
   */
  async rotateSecret(secretName: string, newValue: string): Promise<void> {
    await this.client.send(new UpdateSecretCommand({
      SecretId: secretName,
      SecretString: newValue,
    }));

    await this.client.send(new TagResourceCommand({
      SecretId: secretName,
      Tags: [{ Key: "lastRotated", Value: new Date().toISOString() }],
    }));
  }

  /**
   * Check if a secret is due for rotation based on its age.
   */
  async checkRotationDue(secretName: string, maxAgeDays: number): Promise<boolean> {
    const response = await this.client.send(new DescribeSecretCommand({
      SecretId: secretName,
    }));

    const lastRotatedTag = response.Tags?.find(t => t.Key === "lastRotated");
    if (!lastRotatedTag?.Value) {
      // No rotation tag means it was never rotated — it's due
      return true;
    }

    const lastRotated = new Date(lastRotatedTag.Value);
    const ageDays = (Date.now() - lastRotated.getTime()) / (1000 * 60 * 60 * 24);
    return ageDays > maxAgeDays;
  }

  /**
   * List all secrets in the /clawster/ namespace that are older than maxAgeDays.
   */
  async listStaleSecrets(maxAgeDays: number): Promise<StaleSecret[]> {
    const stale: StaleSecret[] = [];
    const response = await this.client.send(new ListSecretsCommand({
      Filters: [{ Key: "name", Values: ["/clawster/"] }],
    }));

    for (const secret of response.SecretList ?? []) {
      if (!secret.Name) continue;

      const lastRotatedTag = secret.Tags?.find(t => t.Key === "lastRotated");
      const lastRotated = lastRotatedTag?.Value
        ? new Date(lastRotatedTag.Value)
        : secret.CreatedDate ?? new Date(0);

      const ageDays = (Date.now() - lastRotated.getTime()) / (1000 * 60 * 60 * 24);

      if (ageDays > maxAgeDays) {
        stale.push({ name: secret.Name, lastRotated, ageDays: Math.floor(ageDays) });
      }
    }

    return stale;
  }
}
