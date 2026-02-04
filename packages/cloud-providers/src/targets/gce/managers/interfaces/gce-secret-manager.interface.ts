/**
 * GCE Secret Manager Interface
 *
 * Provides abstraction for secret storage operations.
 * Enables dependency injection for testing and allows using
 * either direct GCP SDK or @clawster/adapters-gcp services.
 */

/**
 * Interface for managing GCP Secret Manager secrets.
 */
export interface IGceSecretManager {
  /**
   * Ensure a secret exists with the given value.
   * Creates the secret if it doesn't exist, or adds a new version if it does.
   *
   * @param name - Secret name
   * @param value - Secret value
   */
  ensureSecret(name: string, value: string): Promise<void>;

  /**
   * Get the latest version of a secret.
   *
   * @param name - Secret name
   * @returns Secret value, or undefined if not found
   */
  getSecret(name: string): Promise<string | undefined>;

  /**
   * Delete a secret.
   *
   * @param name - Secret name
   */
  deleteSecret(name: string): Promise<void>;

  /**
   * Check if a secret exists.
   *
   * @param name - Secret name
   * @returns True if the secret exists
   */
  secretExists(name: string): Promise<boolean>;
}
