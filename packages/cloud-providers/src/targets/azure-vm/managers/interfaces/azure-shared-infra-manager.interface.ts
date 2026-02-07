/**
 * Azure Shared Infrastructure Manager Interface
 *
 * Provides abstraction for shared Azure resources that are provisioned once
 * per resource group and reused across bot VMs: Storage Account, File Share,
 * Managed Identity, Key Vault, and RBAC role assignments.
 */

/**
 * Result from ensureManagedIdentity.
 */
export interface ManagedIdentityInfo {
  /** Full Azure resource ID */
  id: string;
  /** Client ID used in cloud-init for IMDS token requests */
  clientId: string;
  /** Object (principal) ID used for RBAC role assignments */
  principalId: string;
}

/**
 * Result from ensureKeyVault.
 */
export interface KeyVaultInfo {
  /** Full Azure resource ID */
  id: string;
  /** Key Vault name */
  name: string;
  /** Key Vault URI (e.g., https://myvault.vault.azure.net) */
  uri: string;
}

/**
 * Interface for managing shared Azure infrastructure resources.
 */
export interface IAzureSharedInfraManager {
  /**
   * Ensure a Storage Account exists, creating it if necessary.
   * Uses Standard_LRS, StorageV2.
   */
  ensureStorageAccount(name: string): Promise<{ id: string; name: string }>;

  /**
   * Ensure an Azure Files share exists within a storage account.
   */
  ensureFileShare(storageAccountName: string, shareName: string): Promise<void>;

  /**
   * Ensure a user-assigned Managed Identity exists.
   * Returns clientId (for IMDS) and principalId (for RBAC).
   */
  ensureManagedIdentity(name: string): Promise<ManagedIdentityInfo>;

  /**
   * Ensure a Key Vault exists with RBAC authorization enabled.
   */
  ensureKeyVault(name: string, tenantId: string): Promise<KeyVaultInfo>;

  /**
   * Assign RBAC roles so the Managed Identity can access storage keys and KV secrets.
   * - Storage Account Key Operator Service Role on the storage account
   * - Key Vault Secrets User on the key vault
   *
   * Idempotent — silently handles existing assignments.
   */
  assignRoles(principalId: string, storageAccountId: string, keyVaultId: string): Promise<void>;
}
