import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

export interface SecretValue {
  name: string;
  value: string;
  versionId?: string;
}

export interface SecretManagerServiceConfig {
  projectId: string;
  keyFilename?: string;
  credentials?: {
    client_email: string;
    private_key: string;
  };
}

/**
 * Service for managing GCP Secret Manager secrets.
 * Provides CRUD operations for secrets with Clawster-specific naming conventions.
 */
export class SecretManagerService {
  private readonly client: SecretManagerServiceClient;
  private readonly projectId: string;

  constructor(config: SecretManagerServiceConfig) {
    const clientOptions: { projectId: string; keyFilename?: string; credentials?: { client_email: string; private_key: string } } = {
      projectId: config.projectId,
    };

    if (config.keyFilename) {
      clientOptions.keyFilename = config.keyFilename;
    } else if (config.credentials) {
      clientOptions.credentials = config.credentials;
    }

    this.client = new SecretManagerServiceClient(clientOptions);
    this.projectId = config.projectId;
  }

  /**
   * Create a new secret with an initial version.
   *
   * @param name - Secret name (will be sanitized)
   * @param value - Secret value
   * @param labels - Optional labels for the secret
   * @returns Full secret name (resource path)
   */
  async createSecret(
    name: string,
    value: string,
    labels?: Record<string, string>
  ): Promise<string> {
    const sanitizedName = this.sanitizeName(name);
    const parent = `projects/${this.projectId}`;

    // Create the secret
    const [secret] = await this.client.createSecret({
      parent,
      secretId: sanitizedName,
      secret: {
        replication: {
          automatic: {},
        },
        labels,
      },
    });

    // Add the secret version with the value
    await this.client.addSecretVersion({
      parent: secret.name,
      payload: {
        data: Buffer.from(value, "utf8"),
      },
    });

    return secret.name ?? "";
  }

  /**
   * Update a secret by adding a new version.
   *
   * @param name - Secret name
   * @param value - New secret value
   * @returns Version ID of the new version
   */
  async updateSecret(name: string, value: string): Promise<string> {
    const sanitizedName = this.sanitizeName(name);
    const secretName = `projects/${this.projectId}/secrets/${sanitizedName}`;

    const [version] = await this.client.addSecretVersion({
      parent: secretName,
      payload: {
        data: Buffer.from(value, "utf8"),
      },
    });

    return version.name?.split("/").pop() ?? "";
  }

  /**
   * Get the latest version of a secret.
   *
   * @param name - Secret name
   * @returns Secret value, or undefined if not found
   */
  async getSecret(name: string): Promise<string | undefined> {
    try {
      const sanitizedName = this.sanitizeName(name);
      const secretName = `projects/${this.projectId}/secrets/${sanitizedName}/versions/latest`;

      const [version] = await this.client.accessSecretVersion({
        name: secretName,
      });

      return version.payload?.data?.toString() ?? undefined;
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return undefined;
      }
      throw error;
    }
  }

  /**
   * Get a specific version of a secret.
   *
   * @param name - Secret name
   * @param versionId - Version ID (e.g., "1", "2", "latest")
   * @returns Secret value, or undefined if not found
   */
  async getSecretVersion(name: string, versionId: string): Promise<string | undefined> {
    try {
      const sanitizedName = this.sanitizeName(name);
      const secretName = `projects/${this.projectId}/secrets/${sanitizedName}/versions/${versionId}`;

      const [version] = await this.client.accessSecretVersion({
        name: secretName,
      });

      return version.payload?.data?.toString() ?? undefined;
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return undefined;
      }
      throw error;
    }
  }

  /**
   * Delete a secret and all its versions.
   *
   * @param name - Secret name
   */
  async deleteSecret(name: string): Promise<void> {
    try {
      const sanitizedName = this.sanitizeName(name);
      const secretName = `projects/${this.projectId}/secrets/${sanitizedName}`;

      await this.client.deleteSecret({
        name: secretName,
      });
    } catch (error) {
      if (!this.isNotFoundError(error)) {
        throw error;
      }
    }
  }

  /**
   * Check if a secret exists.
   *
   * @param name - Secret name
   * @returns True if the secret exists
   */
  async secretExists(name: string): Promise<boolean> {
    try {
      const sanitizedName = this.sanitizeName(name);
      const secretName = `projects/${this.projectId}/secrets/${sanitizedName}`;

      await this.client.getSecret({
        name: secretName,
      });
      return true;
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Ensure secrets exist for a Clawster instance.
   * Creates or updates secrets with Clawster naming conventions.
   *
   * @param workspace - Workspace name
   * @param instanceName - Instance name
   * @param secrets - Key-value pairs to store
   * @returns Map of key to full secret resource name
   */
  async ensureSecretsForInstance(
    workspace: string,
    instanceName: string,
    secrets: Record<string, string>
  ): Promise<Record<string, string>> {
    const names: Record<string, string> = {};

    for (const [key, value] of Object.entries(secrets)) {
      const secretName = `clawster-${workspace}-${instanceName}-${key}`;
      const sanitizedName = this.sanitizeName(secretName);

      if (await this.secretExists(secretName)) {
        await this.updateSecret(secretName, value);
      } else {
        await this.createSecret(secretName, value, {
          "managed-by": "clawster",
          workspace: this.sanitizeLabel(workspace),
          instance: this.sanitizeLabel(instanceName),
        });
      }

      names[key] = `projects/${this.projectId}/secrets/${sanitizedName}/versions/latest`;
    }

    return names;
  }

  /**
   * List all secrets with a specific label filter.
   *
   * @param filter - Filter expression (e.g., "labels.managed-by=clawster")
   * @returns Array of secret names
   */
  async listSecrets(filter?: string): Promise<string[]> {
    const parent = `projects/${this.projectId}`;
    const secrets: string[] = [];

    const [secretsList] = await this.client.listSecrets({
      parent,
      filter,
    });

    for (const secret of secretsList) {
      if (secret.name) {
        secrets.push(secret.name.split("/").pop() ?? "");
      }
    }

    return secrets;
  }

  /**
   * Sanitize a secret name to comply with GCP naming requirements.
   * Secret names can contain uppercase and lowercase letters, numbers, hyphens, and underscores.
   */
  private sanitizeName(name: string): string {
    const sanitized = name
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 255);

    if (!sanitized) {
      throw new Error(`Invalid secret name: "${name}" produces empty sanitized value`);
    }

    // Must start with a letter
    if (!/^[a-zA-Z]/.test(sanitized)) {
      return `s${sanitized}`;
    }

    return sanitized;
  }

  /**
   * Sanitize a label value to comply with GCP label requirements.
   * Labels can contain lowercase letters, numbers, hyphens, and underscores.
   */
  private sanitizeLabel(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 63);
  }

  private isNotFoundError(error: unknown): boolean {
    return (
      error instanceof Error &&
      (error.message.includes("NOT_FOUND") ||
        error.message.includes("404") ||
        error.message.includes("does not exist") ||
        (error as { code?: number }).code === 5) // gRPC NOT_FOUND code
    );
  }
}
