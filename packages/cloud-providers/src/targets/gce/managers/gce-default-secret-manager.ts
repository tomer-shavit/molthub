/**
 * GCE Default Secret Manager
 *
 * Default implementation using direct @google-cloud/secret-manager SDK.
 * Used for backward compatibility when no adapter is injected.
 */

import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import type { IGceSecretManager } from "./interfaces";
import type { GceLogCallback } from "../types";

/**
 * Configuration for the default secret manager.
 */
export interface GceDefaultSecretManagerConfig {
  /** GCP project ID */
  projectId: string;
  /** Path to service account key file (optional) */
  keyFilePath?: string;
  /** Log callback function */
  log?: GceLogCallback;
}

/**
 * Default secret manager implementation using direct GCP SDK.
 *
 * This is used internally by GceTarget when no external SecretManagerService
 * is provided via dependency injection. It provides backward compatibility
 * with existing deployments.
 */
export class GceDefaultSecretManager implements IGceSecretManager {
  private readonly client: SecretManagerServiceClient;
  private readonly projectId: string;
  private readonly log: GceLogCallback;

  constructor(config: GceDefaultSecretManagerConfig) {
    const clientOptions = config.keyFilePath
      ? { keyFilename: config.keyFilePath }
      : {};

    this.client = new SecretManagerServiceClient(clientOptions);
    this.projectId = config.projectId;
    this.log = config.log ?? (() => {});
  }

  async ensureSecret(name: string, value: string): Promise<void> {
    const parent = `projects/${this.projectId}`;
    const secretPath = `${parent}/secrets/${name}`;

    try {
      // Check if secret exists
      await this.client.getSecret({ name: secretPath });

      // Secret exists, add new version
      await this.client.addSecretVersion({
        parent: secretPath,
        payload: {
          data: Buffer.from(value, "utf8"),
        },
      });
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) {
        // Create secret
        await this.client.createSecret({
          parent,
          secretId: name,
          secret: {
            replication: {
              automatic: {},
            },
          },
        });

        // Add initial version
        await this.client.addSecretVersion({
          parent: secretPath,
          payload: {
            data: Buffer.from(value, "utf8"),
          },
        });
      } else {
        throw error;
      }
    }
  }

  async getSecret(name: string): Promise<string | undefined> {
    try {
      const secretPath = `projects/${this.projectId}/secrets/${name}/versions/latest`;
      const [version] = await this.client.accessSecretVersion({ name: secretPath });
      return version.payload?.data?.toString() ?? undefined;
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return undefined;
      }
      throw error;
    }
  }

  async deleteSecret(name: string): Promise<void> {
    try {
      const secretPath = `projects/${this.projectId}/secrets/${name}`;
      await this.client.deleteSecret({ name: secretPath });
    } catch (error) {
      if (!this.isNotFoundError(error)) {
        throw error;
      }
      // Ignore not found errors when deleting
    }
  }

  async secretExists(name: string): Promise<boolean> {
    try {
      const secretPath = `projects/${this.projectId}/secrets/${name}`;
      await this.client.getSecret({ name: secretPath });
      return true;
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return false;
      }
      throw error;
    }
  }

  private isNotFoundError(error: unknown): boolean {
    return (
      error instanceof Error &&
      (error.message.includes("NOT_FOUND") || error.message.includes("404"))
    );
  }
}
