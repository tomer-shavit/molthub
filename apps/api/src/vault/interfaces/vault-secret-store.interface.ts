/**
 * Interface for vault secret storage operations.
 * Each cloud provider implements this to store/retrieve secrets
 * in its native vault service.
 */
export interface IVaultSecretStore {
  storeSecret(instanceId: string, key: string, value: string): Promise<void>;
  getSecret(instanceId: string, key: string): Promise<string | undefined>;
  deleteSecret(instanceId: string, key: string): Promise<void>;
}

export const VAULT_SECRET_STORE = Symbol("VAULT_SECRET_STORE");
