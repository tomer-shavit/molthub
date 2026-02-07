/**
 * Azure Manager Factory
 *
 * Creates and wires up all Azure VM managers with their dependencies.
 * Follows SOLID principles by enabling dependency injection.
 */

import { ComputeManagementClient } from "@azure/arm-compute";
import { NetworkManagementClient } from "@azure/arm-network";
import { StorageManagementClient } from "@azure/arm-storage";
import { KeyVaultManagementClient } from "@azure/arm-keyvault";
import { ManagedServiceIdentityClient } from "@azure/arm-msi";
import { AuthorizationManagementClient } from "@azure/arm-authorization";
import { DefaultAzureCredential, TokenCredential } from "@azure/identity";

import {
  AzureNetworkManager,
  AzureComputeManager,
  AzureSharedInfraManager,
} from "./managers";

import type {
  IAzureNetworkManager,
  IAzureComputeManager,
  IAzureSharedInfraManager,
} from "./managers";

import type { AzureLogCallback } from "./types";

/**
 * Configuration for the Azure manager factory.
 */
export interface AzureManagerFactoryConfig {
  /** Azure subscription ID */
  subscriptionId: string;
  /** Azure resource group name */
  resourceGroup: string;
  /** Azure region (e.g., "eastus") */
  location: string;
  /** Azure credentials (optional, uses DefaultAzureCredential if not provided) */
  credentials?: TokenCredential;
  /** Log callback function */
  log: AzureLogCallback;
}

/**
 * Collection of all Azure VM managers.
 */
export interface AzureManagers {
  /** Network manager for VNets, subnets, NSGs, and public IPs */
  networkManager: IAzureNetworkManager;
  /** Compute manager for VMs, disks, and NICs */
  computeManager: IAzureComputeManager;
  /** Shared infrastructure manager for Storage, MI, Key Vault, RBAC */
  sharedInfraManager: IAzureSharedInfraManager;
}

/**
 * Factory class for creating Azure managers with proper wiring.
 */
export class AzureManagerFactory {
  /**
   * Create all Azure managers with proper dependencies wired.
   */
  static createManagers(config: AzureManagerFactoryConfig): AzureManagers {
    const { subscriptionId, resourceGroup, location, credentials, log } = config;

    const credential = credentials ?? new DefaultAzureCredential();

    const computeClient = new ComputeManagementClient(credential, subscriptionId);
    const networkClient = new NetworkManagementClient(credential, subscriptionId);
    const storageClient = new StorageManagementClient(credential, subscriptionId);
    const kvMgmtClient = new KeyVaultManagementClient(credential, subscriptionId);
    const msiClient = new ManagedServiceIdentityClient(credential, subscriptionId);
    const authClient = new AuthorizationManagementClient(credential, subscriptionId);

    const networkManager = new AzureNetworkManager(
      networkClient,
      resourceGroup,
      location,
      log
    );

    const computeManager = new AzureComputeManager(
      computeClient,
      networkClient,
      resourceGroup,
      location,
      log
    );

    const sharedInfraManager = new AzureSharedInfraManager(
      storageClient,
      kvMgmtClient,
      msiClient,
      authClient,
      subscriptionId,
      resourceGroup,
      location,
      log
    );

    return {
      networkManager,
      computeManager,
      sharedInfraManager,
    };
  }
}
