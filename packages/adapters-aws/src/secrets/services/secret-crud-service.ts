/**
 * Secret CRUD Service
 *
 * Handles basic CRUD operations for secrets.
 * Part of SRP-compliant Secrets Manager service split.
 */

import {
  SecretsManagerClient,
  CreateSecretCommand,
  GetSecretValueCommand,
  PutSecretValueCommand,
  DeleteSecretCommand,
  DescribeSecretCommand,
} from "@aws-sdk/client-secrets-manager";
import type {
  ISecretReader,
  ISecretWriter,
} from "@clawster/adapters-common";
import { AwsErrorHandler } from "../../errors";

export class SecretCrudService implements ISecretReader, ISecretWriter {
  constructor(private readonly client: SecretsManagerClient) {}

  /**
   * Create a new secret.
   */
  async createSecret(
    name: string,
    value: string,
    tags?: Record<string, string>
  ): Promise<string> {
    const result = await this.client.send(
      new CreateSecretCommand({
        Name: name,
        SecretString: value,
        Tags: Object.entries(tags ?? {}).map(([Key, Value]) => ({ Key, Value })),
      })
    );

    return result.ARN ?? "";
  }

  /**
   * Update an existing secret's value.
   */
  async updateSecret(name: string, value: string): Promise<void> {
    await this.client.send(
      new PutSecretValueCommand({
        SecretId: name,
        SecretString: value,
      })
    );
  }

  /**
   * Get a secret's value.
   */
  async getSecret(name: string): Promise<string | undefined> {
    try {
      const result = await this.client.send(
        new GetSecretValueCommand({
          SecretId: name,
        })
      );
      return result.SecretString;
    } catch (error) {
      if (AwsErrorHandler.isResourceNotFound(error)) {
        return undefined;
      }
      throw error;
    }
  }

  /**
   * Delete a secret.
   */
  async deleteSecret(name: string, forceDelete: boolean = false): Promise<void> {
    try {
      await this.client.send(
        new DeleteSecretCommand({
          SecretId: name,
          ForceDeleteWithoutRecovery: forceDelete,
        })
      );
    } catch (error) {
      // Ignore if not found
      if (!AwsErrorHandler.isResourceNotFound(error)) {
        throw error;
      }
    }
  }

  /**
   * Check if a secret exists.
   */
  async secretExists(name: string): Promise<boolean> {
    try {
      await this.client.send(
        new DescribeSecretCommand({
          SecretId: name,
        })
      );
      return true;
    } catch (error) {
      if (AwsErrorHandler.isResourceNotFound(error)) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Describe a secret to get its full ARN (includes random 6-char suffix).
   */
  async describeSecret(secretId: string): Promise<{ arn: string }> {
    const result = await this.client.send(
      new DescribeSecretCommand({ SecretId: secretId })
    );
    if (!result.ARN) {
      throw new Error(`Secret "${secretId}" has no ARN — DescribeSecret returned undefined`);
    }
    return { arn: result.ARN };
  }
}
