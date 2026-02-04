/**
 * Azure Manager Factory
 *
 * Creates and wires up all Azure VM managers with their dependencies.
 * Follows SOLID principles by enabling dependency injection.
 */

import { ComputeManagementClient } from "@azure/arm-compute";
import { NetworkManagementClient } from "@azure/arm-network";
import { DefaultAzureCredential, TokenCredential } from "@azure/identity";

import {
  AzureNetworkManager,
  AzureComputeManager,
  AzureAppGatewayManager,
} from "./managers";

import type {
  IAzureNetworkManager,
  IAzureComputeManager,
  IAzureAppGatewayManager,
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
  /** Network manager for VNets, subnets, and NSGs */
  networkManager: IAzureNetworkManager;
  /** Compute manager for VMs, disks, and NICs */
  computeManager: IAzureComputeManager;
  /** Application Gateway manager for load balancing */
  appGatewayManager: IAzureAppGatewayManager;
}

/**
 * Factory class for creating Azure managers with proper wiring.
 *
 * This class centralizes the creation of all Azure SDK clients and managers,
 * ensuring they are correctly wired together. Using a factory enables:
 *
 * 1. Single place to configure SDK clients (credentials, subscription, region)
 * 2. Correct dependency order (shared clients across managers)
 * 3. Easy testing by allowing mock managers to be passed instead
 *
 * @example
 * ```typescript
 * // Production usage
 * const managers = AzureManagerFactory.createManagers({
 *   subscriptionId: "my-subscription",
 *   resourceGroup: "my-rg",
 *   location: "eastus",
 *   log: (msg, stream) => console.log(msg),
 * });
 *
 * // Testing usage - create with mock managers
 * const target = new AzureVmTarget({
 *   config: testConfig,
 *   managers: { ...mockManagers },
 * });
 * ```
 */
export class AzureManagerFactory {
  /**
   * Create all Azure managers with proper dependencies wired.
   *
   * @param config - Factory configuration
   * @returns Collection of all managers
   */
  static createManagers(config: AzureManagerFactoryConfig): AzureManagers {
    const { subscriptionId, resourceGroup, location, credentials, log } = config;

    // Use provided credentials or default
    const credential = credentials ?? new DefaultAzureCredential();

    // Initialize Azure SDK clients
    const computeClient = new ComputeManagementClient(credential, subscriptionId);
    const networkClient = new NetworkManagementClient(credential, subscriptionId);

    // Create network manager
    const networkManager = new AzureNetworkManager(
      networkClient,
      resourceGroup,
      location,
      log
    );

    // Create compute manager (needs both compute and network clients)
    const computeManager = new AzureComputeManager(
      computeClient,
      networkClient,
      resourceGroup,
      location,
      log
    );

    // Create Application Gateway manager
    const appGatewayManager = new AzureAppGatewayManager(
      networkClient,
      subscriptionId,
      resourceGroup,
      location,
      log
    );

    return {
      networkManager,
      computeManager,
      appGatewayManager,
    };
  }
}
