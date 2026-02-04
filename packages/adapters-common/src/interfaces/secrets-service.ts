/**
 * Interface for secrets management services.
 * Implemented by AWS SecretsManagerService and Azure KeyVaultService.
 */
export interface ISecretsService {
  /**
   * Create a new secret.
   * @param name - The name of the secret
   * @param value - The secret value
   * @param tags - Optional tags/metadata to attach
   * @returns The secret identifier (ARN for AWS, ID for Azure)
   */
  createSecret(
    name: string,
    value: string,
    tags?: Record<string, string>
  ): Promise<string>;

  /**
   * Update an existing secret's value.
   * @param name - The name of the secret
   * @param value - The new secret value
   */
  updateSecret(name: string, value: string): Promise<void>;

  /**
   * Get a secret's value.
   * @param name - The name of the secret
   * @returns The secret value, or undefined if not found
   */
  getSecret(name: string): Promise<string | undefined>;

  /**
   * Delete a secret.
   * @param name - The name of the secret
   * @param forceDelete - For AWS: immediate delete. For Azure: purge.
   */
  deleteSecret(name: string, forceDelete?: boolean): Promise<void>;

  /**
   * Check if a secret exists.
   * @param name - The name of the secret
   */
  secretExists(name: string): Promise<boolean>;

  /**
   * Ensure all secrets for a bot instance exist.
   * Creates missing secrets, updates existing ones.
   * @param workspace - The workspace name
   * @param instanceName - The bot instance name
   * @param secrets - Map of secret keys to values
   * @returns Map of secret names to their identifiers (ARN/ID)
   */
  ensureSecretsForInstance(
    workspace: string,
    instanceName: string,
    secrets: Record<string, string>
  ): Promise<Record<string, string>>;
}
