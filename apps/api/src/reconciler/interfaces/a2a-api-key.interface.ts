/**
 * IA2aApiKeyService — manages A2A (agent-to-agent) API keys.
 *
 * Single Responsibility: Generate, rotate, and revoke API keys used for
 * inter-bot communication (delegation).
 */
export interface IA2aApiKeyService {
  /**
   * Ensure a delegation API key exists for a bot instance.
   * Revokes any previous delegation keys and generates a fresh one.
   *
   * @param botInstanceId - The bot instance ID
   * @returns The plaintext API key (only returned once)
   */
  ensureDelegationApiKey(botInstanceId: string): Promise<string>;

  /**
   * Generate a new API key for a bot instance with a given label.
   *
   * @param botInstanceId - The bot instance ID
   * @param label - A label to identify the key's purpose
   * @returns The plaintext API key (only returned once)
   */
  generateApiKey(botInstanceId: string, label: string): Promise<string>;

  /**
   * Revoke all active API keys with a given label for a bot instance.
   *
   * @param botInstanceId - The bot instance ID
   * @param label - The label of keys to revoke
   * @returns The number of keys revoked
   */
  revokeApiKeys(botInstanceId: string, label: string): Promise<number>;
}

/**
 * Injection token for IA2aApiKeyService.
 */
export const A2A_API_KEY_SERVICE = Symbol("A2A_API_KEY_SERVICE");
