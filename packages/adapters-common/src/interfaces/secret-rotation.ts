import type { StaleSecret } from "../types/secret";

/**
 * Interface for secret rotation services.
 * Implemented by AWS TokenRotationService and Azure SecretRotationService.
 */
export interface ISecretRotationService {
  /**
   * Rotate a secret to a new value.
   * Updates the secret and sets a lastRotated timestamp.
   */
  rotateSecret(secretName: string, newValue: string): Promise<void>;

  /**
   * Check if a secret is due for rotation.
   * @param secretName - The name of the secret to check
   * @param maxAgeDays - Maximum age in days before rotation is due
   */
  checkRotationDue(secretName: string, maxAgeDays: number): Promise<boolean>;

  /**
   * List all secrets that are overdue for rotation.
   * @param maxAgeDays - Maximum age in days
   */
  listStaleSecrets(maxAgeDays: number): Promise<StaleSecret[]>;
}
