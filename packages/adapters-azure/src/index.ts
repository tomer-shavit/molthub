// Container Instance
export { AciService, AciDeploymentConfig } from "./aci/aci-service";

// Secrets & Key Vault
export { KeyVaultService, SecretValue } from "./secrets/keyvault-service";
export { SecretRotationService, StaleSecret } from "./secrets/secret-rotation.service";

// Log Analytics
export { LogAnalyticsService, LogEvent } from "./log-analytics/log-analytics-service";

// Compute (VM, Disk, NIC)
export {
  ComputeService,
  VmStatus,
  CreateVmOptions,
} from "./compute/compute-service";

// Network (VNet, Subnet, NSG, Public IP)
export {
  NetworkService,
  SecurityRule,
} from "./network/network-service";

// Application Gateway
export {
  AppGatewayService,
  GatewayEndpointInfo,
  CreateAppGatewayOptions,
} from "./appgateway/appgateway-service";

// Resource Management
export {
  ResourceService,
  ResourceSummary,
} from "./resources/resource-service";

/**
 * Azure configuration interface for the adapters package.
 */
export interface AzureConfig {
  /** Azure subscription ID */
  subscriptionId: string;
  /** Default resource group name */
  resourceGroup: string;
  /** Azure region (e.g., "eastus") */
  location?: string;
  /** Key Vault name for secrets */
  keyVaultName?: string;
  /** Log Analytics workspace ID */
  logAnalyticsWorkspaceId?: string;
}
