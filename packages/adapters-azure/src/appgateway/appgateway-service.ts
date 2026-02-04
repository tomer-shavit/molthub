/**
 * Azure Application Gateway Service
 *
 * Provides operations for managing Azure Application Gateways.
 * Application Gateway provides Layer 7 load balancing with SSL termination,
 * URL-based routing, and Web Application Firewall (WAF) capabilities.
 */

import {
  NetworkManagementClient,
  ApplicationGateway,
  PublicIPAddress,
} from "@azure/arm-network";
import { DefaultAzureCredential, TokenCredential } from "@azure/identity";

/**
 * Application Gateway endpoint information.
 */
export interface GatewayEndpointInfo {
  /** Public IP address */
  publicIp: string;
  /** Fully qualified domain name */
  fqdn: string;
}

/**
 * Options for creating an Application Gateway.
 */
export interface CreateAppGatewayOptions {
  /** Application Gateway name */
  name: string;
  /** Subnet resource ID */
  subnetId: string;
  /** Public IP name */
  publicIpName: string;
  /** Backend pool port (gateway port) */
  gatewayPort: number;
  /** Backend pool name (default: "vmBackendPool") */
  backendPoolName?: string;
  /** Health probe path (default: "/health") */
  healthProbePath?: string;
  /** Request timeout in seconds (default: 60) */
  requestTimeout?: number;
  /** SKU name (default: "Standard_v2") */
  skuName?: string;
  /** SKU tier (default: "Standard_v2") */
  skuTier?: string;
  /** Capacity (default: 1) */
  capacity?: number;
}

/**
 * Azure Application Gateway Service.
 */
export class AppGatewayService {
  private readonly networkClient: NetworkManagementClient;
  private readonly subscriptionId: string;
  private readonly resourceGroup: string;
  private readonly location: string;

  /**
   * Create a new AppGatewayService instance.
   *
   * @param subscriptionId - Azure subscription ID
   * @param resourceGroup - Resource group name
   * @param location - Azure region (e.g., "eastus")
   * @param credential - Optional TokenCredential (defaults to DefaultAzureCredential)
   */
  constructor(
    subscriptionId: string,
    resourceGroup: string,
    location: string,
    credential?: TokenCredential
  ) {
    const cred = credential || new DefaultAzureCredential();
    this.networkClient = new NetworkManagementClient(cred, subscriptionId);
    this.subscriptionId = subscriptionId;
    this.resourceGroup = resourceGroup;
    this.location = location;
  }

  /**
   * Create an Application Gateway.
   *
   * @param options - Creation options
   * @returns Created Application Gateway resource
   */
  async createAppGateway(options: CreateAppGatewayOptions): Promise<ApplicationGateway> {
    const {
      name,
      subnetId,
      publicIpName,
      gatewayPort,
      backendPoolName = "vmBackendPool",
      healthProbePath = "/health",
      requestTimeout = 60,
      skuName = "Standard_v2",
      skuTier = "Standard_v2",
      capacity = 1,
    } = options;

    // Check if already exists
    try {
      const existing = await this.networkClient.applicationGateways.get(
        this.resourceGroup,
        name
      );
      return existing;
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode !== 404) {
        throw error;
      }
    }

    const gatewayIpConfigName = "appGatewayIpConfig";
    const frontendIpConfigName = "appGatewayFrontendIp";
    const frontendPortName = "appGatewayFrontendPort";
    const backendHttpSettingsName = "vmBackendHttpSettings";
    const httpListenerName = "vmHttpListener";
    const requestRoutingRuleName = "vmRoutingRule";
    const probeName = "vmHealthProbe";

    const publicIpId = `/subscriptions/${this.subscriptionId}/resourceGroups/${this.resourceGroup}/providers/Microsoft.Network/publicIPAddresses/${publicIpName}`;
    const baseResourceId = `/subscriptions/${this.subscriptionId}/resourceGroups/${this.resourceGroup}/providers/Microsoft.Network/applicationGateways/${name}`;

    const result = await this.networkClient.applicationGateways.beginCreateOrUpdateAndWait(
      this.resourceGroup,
      name,
      {
        location: this.location,
        sku: {
          name: skuName,
          tier: skuTier,
          capacity,
        },
        gatewayIPConfigurations: [
          {
            name: gatewayIpConfigName,
            subnet: { id: subnetId },
          },
        ],
        frontendIPConfigurations: [
          {
            name: frontendIpConfigName,
            publicIPAddress: {
              id: publicIpId,
            },
          },
        ],
        frontendPorts: [
          {
            name: frontendPortName,
            port: 80,
          },
        ],
        backendAddressPools: [
          {
            name: backendPoolName,
            backendAddresses: [],
          },
        ],
        probes: [
          {
            name: probeName,
            protocol: "Http",
            path: healthProbePath,
            interval: 30,
            timeout: 30,
            unhealthyThreshold: 3,
            pickHostNameFromBackendHttpSettings: true,
          },
        ],
        backendHttpSettingsCollection: [
          {
            name: backendHttpSettingsName,
            port: gatewayPort,
            protocol: "Http",
            cookieBasedAffinity: "Disabled",
            requestTimeout,
            probe: {
              id: `${baseResourceId}/probes/${probeName}`,
            },
          },
        ],
        httpListeners: [
          {
            name: httpListenerName,
            frontendIPConfiguration: {
              id: `${baseResourceId}/frontendIPConfigurations/${frontendIpConfigName}`,
            },
            frontendPort: {
              id: `${baseResourceId}/frontendPorts/${frontendPortName}`,
            },
            protocol: "Http",
          },
        ],
        requestRoutingRules: [
          {
            name: requestRoutingRuleName,
            ruleType: "Basic",
            priority: 100,
            httpListener: {
              id: `${baseResourceId}/httpListeners/${httpListenerName}`,
            },
            backendAddressPool: {
              id: `${baseResourceId}/backendAddressPools/${backendPoolName}`,
            },
            backendHttpSettings: {
              id: `${baseResourceId}/backendHttpSettingsCollection/${backendHttpSettingsName}`,
            },
          },
        ],
        tags: {
          managedBy: "clawster",
        },
      }
    );

    return result;
  }

  /**
   * Delete an Application Gateway.
   *
   * @param name - Application Gateway name
   */
  async deleteAppGateway(name: string): Promise<void> {
    try {
      await this.networkClient.applicationGateways.beginDeleteAndWait(
        this.resourceGroup,
        name
      );
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        return; // Already deleted
      }
      throw error;
    }
  }

  /**
   * Update the backend pool with VM IP addresses.
   *
   * @param gatewayName - Application Gateway name
   * @param vmPrivateIp - VM private IP address (or array of IPs)
   */
  async updateBackendPool(
    gatewayName: string,
    vmPrivateIp: string | string[]
  ): Promise<void> {
    const appGw: ApplicationGateway = await this.networkClient.applicationGateways.get(
      this.resourceGroup,
      gatewayName
    );

    const ips = Array.isArray(vmPrivateIp) ? vmPrivateIp : [vmPrivateIp];

    if (appGw.backendAddressPools?.[0]) {
      appGw.backendAddressPools[0].backendAddresses = ips.map((ip) => ({
        ipAddress: ip,
      }));
    }

    await this.networkClient.applicationGateways.beginCreateOrUpdateAndWait(
      this.resourceGroup,
      gatewayName,
      appGw
    );
  }

  /**
   * Get the Application Gateway's public endpoint information.
   *
   * @param publicIpName - Public IP name associated with the gateway
   * @returns Gateway endpoint info (IP and FQDN)
   */
  async getGatewayEndpoint(publicIpName: string): Promise<GatewayEndpointInfo> {
    const pip = await this.networkClient.publicIPAddresses.get(
      this.resourceGroup,
      publicIpName
    );
    return {
      publicIp: pip.ipAddress || "",
      fqdn: pip.dnsSettings?.fqdn || "",
    };
  }

  /**
   * Get Application Gateway information.
   *
   * @param name - Application Gateway name
   * @returns Application Gateway resource or undefined if not found
   */
  async getAppGateway(name: string): Promise<ApplicationGateway | undefined> {
    try {
      return await this.networkClient.applicationGateways.get(
        this.resourceGroup,
        name
      );
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        return undefined;
      }
      throw error;
    }
  }

  /**
   * Ensure a static public IP exists for the Application Gateway.
   *
   * @param name - Public IP name
   * @param dnsLabel - DNS label for FQDN
   * @returns IP address and FQDN
   */
  async ensurePublicIp(
    name: string,
    dnsLabel: string
  ): Promise<{ ipAddress: string; fqdn: string }> {
    // Check if already exists
    try {
      const pip = await this.networkClient.publicIPAddresses.get(
        this.resourceGroup,
        name
      );
      return {
        ipAddress: pip.ipAddress || "",
        fqdn: pip.dnsSettings?.fqdn || "",
      };
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode !== 404) {
        throw error;
      }
    }

    const pip = await this.networkClient.publicIPAddresses.beginCreateOrUpdateAndWait(
      this.resourceGroup,
      name,
      {
        location: this.location,
        sku: { name: "Standard" },
        publicIPAllocationMethod: "Static",
        dnsSettings: {
          domainNameLabel: dnsLabel.toLowerCase().replace(/[^a-z0-9-]/g, ""),
        },
        tags: {
          managedBy: "clawster",
        },
      }
    );

    return {
      ipAddress: pip.ipAddress || "",
      fqdn: pip.dnsSettings?.fqdn || "",
    };
  }

  /**
   * Delete a public IP address.
   *
   * @param name - Public IP name
   */
  async deletePublicIp(name: string): Promise<void> {
    try {
      await this.networkClient.publicIPAddresses.beginDeleteAndWait(
        this.resourceGroup,
        name
      );
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        return; // Already deleted
      }
      throw error;
    }
  }

  /**
   * Delete a subnet.
   *
   * @param vnetName - VNet name
   * @param subnetName - Subnet name
   */
  async deleteSubnet(vnetName: string, subnetName: string): Promise<void> {
    try {
      await this.networkClient.subnets.beginDeleteAndWait(
        this.resourceGroup,
        vnetName,
        subnetName
      );
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        return; // Already deleted
      }
      throw error;
    }
  }
}
