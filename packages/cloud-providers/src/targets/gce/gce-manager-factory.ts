/**
 * GCE Manager Factory
 *
 * Creates and wires up all GCE managers with their dependencies.
 * Follows SOLID principles by enabling dependency injection.
 */

import {
  InstancesClient,
  DisksClient,
  NetworksClient,
  SubnetworksClient,
  FirewallsClient,
  GlobalAddressesClient,
  BackendServicesClient,
  UrlMapsClient,
  TargetHttpProxiesClient,
  TargetHttpsProxiesClient,
  GlobalForwardingRulesClient,
  InstanceGroupsClient,
  SecurityPoliciesClient,
  GlobalOperationsClient,
  ZoneOperationsClient,
  RegionOperationsClient,
} from "@google-cloud/compute";

import {
  GceOperationManager,
  GceNetworkManager,
  GceComputeManager,
  GceLoadBalancerManager,
} from "./managers";

import type {
  IGceOperationManager,
  IGceNetworkManager,
  IGceComputeManager,
  IGceLoadBalancerManager,
} from "./managers";

import type { GceLogCallback } from "./types";

/**
 * Configuration for the GCE manager factory.
 */
export interface GceManagerFactoryConfig {
  /** GCP project ID */
  projectId: string;
  /** GCE zone (e.g., "us-central1-a") */
  zone: string;
  /** GCE region (e.g., "us-central1") */
  region: string;
  /** Path to service account key file (optional, uses ADC if not provided) */
  keyFilePath?: string;
  /** Log callback function */
  log: GceLogCallback;
}

/**
 * Collection of all GCE managers.
 */
export interface GceManagers {
  /** Operation manager for waiting on async GCE operations */
  operationManager: IGceOperationManager;
  /** Network manager for VPCs, subnets, firewalls, and IPs */
  networkManager: IGceNetworkManager;
  /** Compute manager for VMs, disks, and instance groups */
  computeManager: IGceComputeManager;
  /** Load balancer manager for backend services, URL maps, proxies */
  loadBalancerManager: IGceLoadBalancerManager;
}

/**
 * Factory class for creating GCE managers with proper wiring.
 *
 * This class centralizes the creation of all GCE SDK clients and managers,
 * ensuring they are correctly wired together. Using a factory enables:
 *
 * 1. Single place to configure SDK clients (credentials, project, zone)
 * 2. Correct dependency order (operation manager -> other managers)
 * 3. Easy testing by allowing mock managers to be passed instead
 *
 * @example
 * ```typescript
 * // Production usage
 * const managers = GceManagerFactory.createManagers({
 *   projectId: "my-project",
 *   zone: "us-central1-a",
 *   region: "us-central1",
 *   log: (msg, stream) => console.log(msg),
 * });
 *
 * // Testing usage - create with mock managers
 * const target = new GceTarget({
 *   config: testConfig,
 *   managers: { ...mockManagers },
 * });
 * ```
 */
export class GceManagerFactory {
  /**
   * Create all GCE managers with proper dependencies wired.
   *
   * @param config - Factory configuration
   * @returns Collection of all managers
   */
  static createManagers(config: GceManagerFactoryConfig): GceManagers {
    const { projectId, zone, region, keyFilePath, log } = config;

    // GCP client options
    const clientOptions = keyFilePath ? { keyFilename: keyFilePath } : {};

    // Initialize all GCP SDK clients
    const instancesClient = new InstancesClient(clientOptions);
    const disksClient = new DisksClient(clientOptions);
    const networksClient = new NetworksClient(clientOptions);
    const subnetworksClient = new SubnetworksClient(clientOptions);
    const firewallsClient = new FirewallsClient(clientOptions);
    const addressesClient = new GlobalAddressesClient(clientOptions);
    const backendServicesClient = new BackendServicesClient(clientOptions);
    const urlMapsClient = new UrlMapsClient(clientOptions);
    const httpProxiesClient = new TargetHttpProxiesClient(clientOptions);
    const httpsProxiesClient = new TargetHttpsProxiesClient(clientOptions);
    const forwardingRulesClient = new GlobalForwardingRulesClient(clientOptions);
    const instanceGroupsClient = new InstanceGroupsClient(clientOptions);
    const securityPoliciesClient = new SecurityPoliciesClient(clientOptions);
    const globalOperationsClient = new GlobalOperationsClient(clientOptions);
    const zoneOperationsClient = new ZoneOperationsClient(clientOptions);
    const regionOperationsClient = new RegionOperationsClient(clientOptions);

    // Create operation manager first (dependency for other managers)
    const operationManager = new GceOperationManager(
      globalOperationsClient,
      zoneOperationsClient,
      regionOperationsClient,
      projectId,
      zone,
      region,
      log
    );

    // Create network manager
    const networkManager = new GceNetworkManager(
      networksClient,
      subnetworksClient,
      firewallsClient,
      addressesClient,
      operationManager,
      projectId,
      region,
      log
    );

    // Create compute manager
    const computeManager = new GceComputeManager(
      instancesClient,
      disksClient,
      instanceGroupsClient,
      operationManager,
      projectId,
      zone,
      region,
      log
    );

    // Create load balancer manager
    const loadBalancerManager = new GceLoadBalancerManager(
      backendServicesClient,
      urlMapsClient,
      httpProxiesClient,
      httpsProxiesClient,
      forwardingRulesClient,
      securityPoliciesClient,
      operationManager,
      projectId,
      zone,
      log
    );

    return {
      operationManager,
      networkManager,
      computeManager,
      loadBalancerManager,
    };
  }
}
