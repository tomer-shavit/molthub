/**
 * Configuration for Azure Virtual Machine deployment target.
 *
 * ARCHITECTURE: VM-based deployment with full Docker support.
 * Unlike ACI, Azure VM provides:
 * - Full Docker daemon access for sandbox mode (Docker-in-Docker)
 * - Managed Disk for WhatsApp sessions (survives restarts)
 * - No cold starts - VM is always running
 * - State survives VM restarts
 *
 * SECURITY: All deployments use VNet + Application Gateway architecture.
 * VMs are NEVER exposed directly to the internet.
 * External access (for webhooks from Telegram, WhatsApp, etc.) goes through Application Gateway.
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

  /** Data disk size in GB for persistent OpenClaw data. Default: 10 */
  dataDiskSizeGb?: number;

  /** Bot/profile name — used to derive resource names */
  profileName?: string;

  /** Container image (default: "node:22-slim") */
  image?: string;

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

  // ── Application Gateway Configuration ──

  /** Application Gateway name */
  appGatewayName?: string;

  /** Application Gateway subnet name (separate from VM subnet) */
  appGatewaySubnetName?: string;

  /** Application Gateway subnet address prefix (e.g., "10.0.2.0/24") */
  appGatewaySubnetAddressPrefix?: string;

  /** SSL certificate ID in Key Vault for HTTPS termination */
  sslCertificateSecretId?: string;

  /** Custom domain for Application Gateway */
  customDomain?: string;

  // ── Secrets & Logging ──

  /** Azure Key Vault name for storing secrets */
  keyVaultName?: string;

  /** Log Analytics workspace ID for centralized logging */
  logAnalyticsWorkspaceId?: string;

  /** Log Analytics workspace key (required if workspaceId is provided) */
  logAnalyticsWorkspaceKey?: string;

  // ── Security Options ──

  /**
   * Allowed source IP ranges for NSG inbound rules (CIDR notation).
   * Only traffic from these ranges can reach the gateway port via Application Gateway.
   * IMPORTANT: Always configure this to restrict access in production.
   */
  allowedCidr?: string[];

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
