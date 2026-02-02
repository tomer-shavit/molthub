import {
  SecretsManagerClient,
  CreateSecretCommand,
  GetSecretValueCommand,
  PutSecretValueCommand,
  DeleteSecretCommand,
  DescribeSecretCommand,
} from "@aws-sdk/client-secrets-manager";

export interface SecretValue {
  name: string;
  value: string;
  arn?: string;
}

export class SecretsManagerService {
  private client: SecretsManagerClient;

  constructor(region: string = "us-east-1") {
    this.client = new SecretsManagerClient({ region });
  }

  async createSecret(
    name: string,
    value: string,
    tags?: Record<string, string>
  ): Promise<string> {
    const result = await this.client.send(new CreateSecretCommand({
      Name: name,
      SecretString: value,
      Tags: Object.entries(tags || {}).map(([Key, Value]) => ({ Key, Value })),
    }));

    return result.ARN || "";
  }

  async updateSecret(name: string, value: string): Promise<void> {
    await this.client.send(new PutSecretValueCommand({
      SecretId: name,
      SecretString: value,
    }));
  }

  async getSecret(name: string): Promise<string | undefined> {
    try {
      const result = await this.client.send(new GetSecretValueCommand({
        SecretId: name,
      }));
      return result.SecretString;
    } catch (error) {
      if ((error as Error).name === "ResourceNotFoundException") {
        return undefined;
      }
      throw error;
    }
  }

  async deleteSecret(name: string, forceDelete: boolean = false): Promise<void> {
    await this.client.send(new DeleteSecretCommand({
      SecretId: name,
      ForceDeleteWithoutRecovery: forceDelete,
    }));
  }

  async secretExists(name: string): Promise<boolean> {
    try {
      await this.client.send(new DescribeSecretCommand({
        SecretId: name,
      }));
      return true;
    } catch (error) {
      return false;
    }
  }

  // For Clawster - store secrets and return ARNs for ECS
  async ensureSecretsForInstance(
    workspace: string,
    instanceName: string,
    secrets: Record<string, string>
  ): Promise<Record<string, string>> {
    const prefix = `/clawster/${workspace}/${instanceName}`;
    const arns: Record<string, string> = {};

    for (const [key, value] of Object.entries(secrets)) {
      const secretName = `${prefix}/${key}`;
      
      if (await this.secretExists(secretName)) {
        await this.updateSecret(secretName, value);
      } else {
        await this.createSecret(secretName, value, {
          managedBy: "clawster",
          workspace,
          instance: instanceName,
        });
      }

      // Build ARN
      const region = process.env.AWS_REGION || "us-east-1";
      const accountId = process.env.AWS_ACCOUNT_ID || "";
      arns[key] = `arn:aws:secretsmanager:${region}:${accountId}:secret:${secretName}`;
    }

    return arns;
  }
}