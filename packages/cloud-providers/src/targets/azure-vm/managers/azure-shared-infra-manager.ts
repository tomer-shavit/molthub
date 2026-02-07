/**
 * Azure Shared Infrastructure Manager
 *
 * Creates and manages shared resources (Storage Account, File Share,
 * Managed Identity, Key Vault, RBAC roles) that are provisioned once per
 * resource group and reused across bot VMs.
 */

import { createHash } from "node:crypto";

import type { StorageManagementClient } from "@azure/arm-storage";
import type { KeyVaultManagementClient } from "@azure/arm-keyvault";
import type { ManagedServiceIdentityClient } from "@azure/arm-msi";
import type { AuthorizationManagementClient } from "@azure/arm-authorization";

import type { AzureLogCallback } from "../types";
import type {
  IAzureSharedInfraManager,
  ManagedIdentityInfo,
  KeyVaultInfo,
} from "./interfaces";

/** Storage Account Key Operator Service Role */
const STORAGE_KEY_OPERATOR_ROLE_ID = "81a9662b-bebf-436f-a333-f67b29880f12";
/** Key Vault Secrets User */
const KV_SECRETS_USER_ROLE_ID = "4633458b-17de-408a-b874-0445c86b69e6";

export class AzureSharedInfraManager implements IAzureSharedInfraManager {
  constructor(
    private readonly storageClient: StorageManagementClient,
    private readonly kvMgmtClient: KeyVaultManagementClient,
    private readonly msiClient: ManagedServiceIdentityClient,
    private readonly authClient: AuthorizationManagementClient,
    private readonly subscriptionId: string,
    private readonly resourceGroup: string,
    private readonly location: string,
    private readonly log: AzureLogCallback
  ) {}

  // ── Storage Account ──────────────────────────────────────────────────

  async ensureStorageAccount(name: string): Promise<{ id: string; name: string }> {
    try {
      const existing = await this.storageClient.storageAccounts.getProperties(
        this.resourceGroup,
        name
      );
      this.log(`  Storage account already exists: ${name}`);
      return this.validateStorageAccount(existing, name);
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode !== 404) throw error;
    }

    this.log(`  Creating storage account: ${name}`);
    const result = await this.storageClient.storageAccounts.beginCreateAndWait(
      this.resourceGroup,
      name,
      {
        location: this.location,
        sku: { name: "Standard_LRS" },
        kind: "StorageV2",
        tags: { managedBy: "clawster" },
      }
    );
    this.log(`  Storage account created: ${name}`);
    return this.validateStorageAccount(result, name);
  }

  // ── File Share ────────────────────────────────────────────────────────

  async ensureFileShare(storageAccountName: string, shareName: string): Promise<void> {
    try {
      await this.storageClient.fileShares.get(
        this.resourceGroup,
        storageAccountName,
        shareName
      );
      this.log(`  File share already exists: ${shareName}`);
      return;
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode !== 404) throw error;
    }

    this.log(`  Creating file share: ${shareName}`);
    await this.storageClient.fileShares.create(
      this.resourceGroup,
      storageAccountName,
      shareName,
      {}
    );
    this.log(`  File share created: ${shareName}`);
  }

  // ── Managed Identity ─────────────────────────────────────────────────

  async ensureManagedIdentity(name: string): Promise<ManagedIdentityInfo> {
    try {
      const existing = await this.msiClient.userAssignedIdentities.get(
        this.resourceGroup,
        name
      );
      this.log(`  Managed identity already exists: ${name}`);
      return this.validateManagedIdentity(existing, name);
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode !== 404) throw error;
    }

    this.log(`  Creating managed identity: ${name}`);
    const result = await this.msiClient.userAssignedIdentities.createOrUpdate(
      this.resourceGroup,
      name,
      { location: this.location, tags: { managedBy: "clawster" } }
    );
    this.log(`  Managed identity created: ${name}`);
    return this.validateManagedIdentity(result, name);
  }

  // ── Key Vault ────────────────────────────────────────────────────────

  async ensureKeyVault(name: string, tenantId: string): Promise<KeyVaultInfo> {
    try {
      const existing = await this.kvMgmtClient.vaults.get(
        this.resourceGroup,
        name
      );
      this.log(`  Key vault already exists: ${name}`);
      return this.validateKeyVault(existing, name);
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode !== 404) throw error;
    }

    this.log(`  Creating key vault: ${name}`);
    const result = await this.kvMgmtClient.vaults.beginCreateOrUpdateAndWait(
      this.resourceGroup,
      name,
      {
        location: this.location,
        properties: {
          tenantId,
          sku: { family: "A", name: "standard" },
          enableRbacAuthorization: true,
        },
        tags: { managedBy: "clawster" },
      }
    );
    this.log(`  Key vault created: ${name}`);
    return this.validateKeyVault(result, name);
  }

  // ── RBAC Role Assignments ────────────────────────────────────────────

  async assignRoles(
    principalId: string,
    storageAccountId: string,
    keyVaultId: string
  ): Promise<void> {
    this.log(`  Assigning RBAC roles to managed identity...`);

    await Promise.all([
      this.ensureRoleAssignment(
        storageAccountId,
        principalId,
        STORAGE_KEY_OPERATOR_ROLE_ID,
        "Storage Account Key Operator"
      ),
      this.ensureRoleAssignment(
        keyVaultId,
        principalId,
        KV_SECRETS_USER_ROLE_ID,
        "Key Vault Secrets User"
      ),
    ]);

    this.log(`  RBAC roles assigned`);
  }

  // ── Private Helpers ──────────────────────────────────────────────────

  private validateStorageAccount(
    sa: { id?: string; name?: string },
    requestedName: string
  ): { id: string; name: string } {
    if (!sa.id || !sa.name) {
      throw new Error(`Storage account '${requestedName}' returned incomplete data (id=${sa.id}, name=${sa.name})`);
    }
    return { id: sa.id, name: sa.name };
  }

  private validateManagedIdentity(
    mi: { id?: string; clientId?: string; principalId?: string },
    requestedName: string
  ): ManagedIdentityInfo {
    if (!mi.id || !mi.clientId || !mi.principalId) {
      throw new Error(
        `Managed identity '${requestedName}' returned incomplete data (id=${mi.id}, clientId=${mi.clientId}, principalId=${mi.principalId})`
      );
    }
    return { id: mi.id, clientId: mi.clientId, principalId: mi.principalId };
  }

  private validateKeyVault(
    kv: { id?: string; name?: string; properties: { vaultUri?: string } },
    requestedName: string
  ): KeyVaultInfo {
    if (!kv.id || !kv.name || !kv.properties.vaultUri) {
      throw new Error(
        `Key vault '${requestedName}' returned incomplete data (id=${kv.id}, name=${kv.name}, uri=${kv.properties.vaultUri})`
      );
    }
    return { id: kv.id, name: kv.name, uri: kv.properties.vaultUri };
  }

  private async ensureRoleAssignment(
    scope: string,
    principalId: string,
    roleId: string,
    roleName: string
  ): Promise<void> {
    const fullRoleDefId = `/subscriptions/${this.subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/${roleId}`;

    // Deterministic assignment name — same inputs always produce the same GUID
    const assignmentName = this.deterministicUuid(scope, principalId, roleId);

    try {
      await this.authClient.roleAssignments.create(scope, assignmentName, {
        roleDefinitionId: fullRoleDefId,
        principalId,
        principalType: "ServicePrincipal",
      });
      this.log(`    Assigned: ${roleName}`);
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode === 409) {
        this.log(`    Already assigned: ${roleName}`);
        return;
      }
      throw error;
    }
  }

  /**
   * Generate a deterministic UUID from scope + principalId + roleId.
   * Ensures idempotency across retries.
   */
  private deterministicUuid(scope: string, principalId: string, roleId: string): string {
    const hash = createHash("md5")
      .update(`${scope}:${principalId}:${roleId}`)
      .digest("hex");
    // Format as UUID: 8-4-4-4-12
    return [
      hash.slice(0, 8),
      hash.slice(8, 12),
      hash.slice(12, 16),
      hash.slice(16, 20),
      hash.slice(20, 32),
    ].join("-");
  }
}

// ── Name Generation Helpers ──────────────────────────────────────────────

/**
 * Derive deterministic shared infrastructure names from subscription + resource group.
 * Names are deterministic so the same deployment always uses the same resources.
 */
export function deriveSharedInfraNames(
  subscriptionId: string,
  resourceGroup: string
): {
  storageAccountName: string;
  managedIdentityName: string;
  keyVaultName: string;
} {
  const hash = createHash("md5")
    .update(`${subscriptionId}:${resourceGroup}`)
    .digest("hex")
    .slice(0, 6);

  return {
    storageAccountName: `clawster${hash}sa`,    // 16 chars (max 24, lowercase alphanumeric)
    managedIdentityName: "clawster-mi",          // fixed per RG
    keyVaultName: `clawster-${hash}-kv`,         // 18 chars (max 24)
  };
}
