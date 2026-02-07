/**
 * Configuration for Azure Virtual Machine deployment target.
 *
 * ARCHITECTURE: VM-based deployment with Caddy reverse proxy.
 * Internet → NSG (80/443) → VM (static public IP) → Caddy → localhost:port → OpenClaw container
 *
 * Storage: Azure Files (CIFS mount via Managed Identity)
 * Config: Key Vault (fetched via MI during cloud-init)
 * Sandbox: Sysbox runtime (installed via .deb)
 */
export interface AzureVmConfig {
  /** Azure subscription ID */
  subscriptionId: string;

  /** Azure resource group name */
  resourceGroup: string;

  /** Azure region (e.g., "eastus", "westeurope") */
  region: string;

  // ── Authentication ──

  /** Service principal client ID (optional - uses DefaultAzureCredential if not provided) */
  clientId?: string;

  /** Service principal client secret */
  clientSecret?: string;

  /** Azure AD tenant ID */
  tenantId?: string;

  // ── VM Configuration ──

  /** VM size (e.g., "Standard_B2s", "Standard_D2s_v3"). Default: "Standard_B2s" */
  vmSize?: string;

  /** OS disk size in GB. Default: 30 */
  osDiskSizeGb?: number;

  /** Bot/profile name — used to derive resource names */
  profileName?: string;

  /** SSH public key for VM access (required for production, uses placeholder for testing if not provided) */
  sshPublicKey?: string;

  // ── VNet Configuration ──

  /** VNet name - will be created if it doesn't exist */
  vnetName?: string;

  /** VNet address prefix (e.g., "10.0.0.0/16") - used when creating VNet */
  vnetAddressPrefix?: string;

  /** Subnet name for VM */
  subnetName?: string;

  /** Subnet address prefix (e.g., "10.0.1.0/24") - used when creating subnet */
  subnetAddressPrefix?: string;

  /** Network Security Group name - will be created with secure defaults if not provided */
  nsgName?: string;

  // ── Caddy / Domain ──

  /** Custom domain for Caddy auto-HTTPS (Let's Encrypt). If not set, Caddy serves on :80 */
  customDomain?: string;

  // ── Azure Files (persistent storage) ──

  /** Azure Storage Account name for Azure Files. Will be created if not exists. */
  storageAccountName?: string;

  /** Azure Files share name. Default: "clawster-data" */
  shareName?: string;

  // ── Managed Identity ──

  /** User-assigned Managed Identity client ID for Key Vault + Storage access */
  managedIdentityClientId?: string;

  // ── Secrets & Logging ──

  /** Azure Key Vault name for storing secrets */
  keyVaultName?: string;

  /** Log Analytics workspace ID for centralized logging */
  logAnalyticsWorkspaceId?: string;

  /** Log Analytics workspace key (required if workspaceId is provided) */
  logAnalyticsWorkspaceKey?: string;

  // ── Security Options ──

  /**
   * Additional NSG rules for specific services (e.g., allow SSH from bastion)
   */
  additionalNsgRules?: Array<{
    name: string;
    priority: number;
    direction: "Inbound" | "Outbound";
    access: "Allow" | "Deny";
    protocol: "Tcp" | "Udp" | "*";
    sourceAddressPrefix: string;
    destinationPortRange: string;
  }>;
}
