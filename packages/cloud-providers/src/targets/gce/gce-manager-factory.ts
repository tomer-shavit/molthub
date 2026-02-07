/**
 * GCE Manager Factory
 *
 * Creates and wires up all GCE managers with their dependencies.
 * Caddy-on-VM architecture: MIG + Instance Template + Caddy reverse proxy.
 */

import {
  InstancesClient,
  InstanceTemplatesClient,
  InstanceGroupManagersClient,
  HealthChecksClient,
  NetworksClient,
  SubnetworksClient,
  FirewallsClient,
  GlobalOperationsClient,
  ZoneOperationsClient,
  RegionOperationsClient,
} from "@google-cloud/compute";

import {
  GceOperationManager,
  GceNetworkManager,
  GceComputeManager,
  GceDefaultSecretManager,
  GceDefaultLoggingManager,
} from "./managers";

import type {
  IGceOperationManager,
  IGceNetworkManager,
  IGceComputeManager,
  IGceSecretManager,
  IGceLoggingManager,
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
  /** Network manager for VPCs, subnets, and firewalls */
  networkManager: IGceNetworkManager;
  /** Compute manager for MIG, templates, and health checks */
  computeManager: IGceComputeManager;
  /** Secret manager for storing OpenClaw config (optional — uses default if not provided) */
  secretManager?: IGceSecretManager;
  /** Logging manager for retrieving logs (optional — uses default if not provided) */
  loggingManager?: IGceLoggingManager;
}

/**
 * Factory class for creating GCE managers with proper wiring.
 */
export class GceManagerFactory {
  /**
   * Create all GCE managers with proper dependencies wired.
   */
  static createManagers(config: GceManagerFactoryConfig): GceManagers {
    const { projectId, zone, region, keyFilePath, log } = config;

    const clientOptions = keyFilePath ? { keyFilename: keyFilePath } : {};

    // SDK clients
    const instancesClient = new InstancesClient(clientOptions);
    const templatesClient = new InstanceTemplatesClient(clientOptions);
    const migClient = new InstanceGroupManagersClient(clientOptions);
    const healthChecksClient = new HealthChecksClient(clientOptions);
    const networksClient = new NetworksClient(clientOptions);
    const subnetworksClient = new SubnetworksClient(clientOptions);
    const firewallsClient = new FirewallsClient(clientOptions);
    const globalOperationsClient = new GlobalOperationsClient(clientOptions);
    const zoneOperationsClient = new ZoneOperationsClient(clientOptions);
    const regionOperationsClient = new RegionOperationsClient(clientOptions);

    // Operation manager (dependency for other managers)
    const operationManager = new GceOperationManager(
      globalOperationsClient,
      zoneOperationsClient,
      regionOperationsClient,
      projectId,
      zone,
      region,
      log
    );

    // Network manager
    const networkManager = new GceNetworkManager(
      networksClient,
      subnetworksClient,
      firewallsClient,
      operationManager,
      projectId,
      region,
      log
    );

    // Compute manager (MIG-based)
    const computeManager = new GceComputeManager(
      instancesClient,
      templatesClient,
      migClient,
      healthChecksClient,
      operationManager,
      projectId,
      zone,
      region,
      log
    );

    // Secret manager
    const secretManager = new GceDefaultSecretManager({
      projectId,
      keyFilePath,
      log,
    });

    // Logging manager
    const loggingManager = new GceDefaultLoggingManager({
      projectId,
      keyFilePath,
      log,
    });

    return {
      operationManager,
      networkManager,
      computeManager,
      secretManager,
      loggingManager,
    };
  }
}
