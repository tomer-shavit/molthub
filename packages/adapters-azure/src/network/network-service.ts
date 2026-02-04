/**
 * Azure Network Service
 *
 * Provides operations for managing Azure Virtual Networks, Subnets, and Network Security Groups.
 * Extracts network operations from cloud-providers into a reusable adapter.
 */

import {
  NetworkManagementClient,
  VirtualNetwork,
  Subnet,
  NetworkSecurityGroup,
  PublicIPAddress,
} from "@azure/arm-network";
import { DefaultAzureCredential, TokenCredential } from "@azure/identity";

/**
 * NSG security rule definition.
 */
export interface SecurityRule {
  /** Rule name */
  name: string;
  /** Rule priority (100-4096) */
  priority: number;
  /** Traffic direction */
  direction: "Inbound" | "Outbound";
  /** Allow or Deny traffic */
  access: "Allow" | "Deny";
  /** Network protocol */
  protocol: "Tcp" | "Udp" | "*";
  /** Source address prefix (CIDR or service tag) */
  sourceAddressPrefix: string;
  /** Destination port range */
  destinationPortRange: string;
}

/**
 * Azure Network Service for VNet, Subnet, NSG, and Public IP operations.
 */
export class NetworkService {
  private readonly networkClient: NetworkManagementClient;
  private readonly resourceGroup: string;
  private readonly location: string;

  /**
   * Create a new NetworkService instance.
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
    this.resourceGroup = resourceGroup;
    this.location = location;
  }

  // ------------------------------------------------------------------
  // VNet Operations
  // ------------------------------------------------------------------

  /**
   * Ensure a VNet exists, creating it if necessary.
   *
   * @param name - VNet name
   * @param cidr - IP CIDR range (default: "10.0.0.0/16")
   * @returns VNet resource
   */
  async ensureVNet(name: string, cidr: string = "10.0.0.0/16"): Promise<VirtualNetwork> {
    // Check if already exists
    try {
      const existing = await this.networkClient.virtualNetworks.get(
        this.resourceGroup,
        name
      );
      return existing;
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode !== 404) {
        throw error;
      }
    }

    const result = await this.networkClient.virtualNetworks.beginCreateOrUpdateAndWait(
      this.resourceGroup,
      name,
      {
        location: this.location,
        addressSpace: {
          addressPrefixes: [cidr],
        },
        tags: {
          managedBy: "clawster",
        },
      }
    );

    return result;
  }

  /**
   * Delete a VNet.
   *
   * @param name - VNet name
   */
  async deleteVNet(name: string): Promise<void> {
    try {
      await this.networkClient.virtualNetworks.beginDeleteAndWait(
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
   * Get VNet information.
   *
   * @param name - VNet name
   * @returns VNet resource or undefined if not found
   */
  async getVNet(name: string): Promise<VirtualNetwork | undefined> {
    try {
      return await this.networkClient.virtualNetworks.get(
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

  // ------------------------------------------------------------------
  // Subnet Operations
  // ------------------------------------------------------------------

  /**
   * Ensure a subnet exists within a VNet.
   *
   * @param vnetName - VNet name
   * @param subnetName - Subnet name
   * @param cidr - IP CIDR range
   * @param nsgId - Optional NSG resource ID to attach
   * @returns Subnet resource
   */
  async ensureSubnet(
    vnetName: string,
    subnetName: string,
    cidr: string,
    nsgId?: string
  ): Promise<Subnet> {
    // Check if already exists
    try {
      const existing = await this.networkClient.subnets.get(
        this.resourceGroup,
        vnetName,
        subnetName
      );
      return existing;
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode !== 404) {
        throw error;
      }
    }

    const result = await this.networkClient.subnets.beginCreateOrUpdateAndWait(
      this.resourceGroup,
      vnetName,
      subnetName,
      {
        addressPrefix: cidr,
        networkSecurityGroup: nsgId ? { id: nsgId } : undefined,
      }
    );

    return result;
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

  /**
   * Get subnet information.
   *
   * @param vnetName - VNet name
   * @param subnetName - Subnet name
   * @returns Subnet resource or undefined if not found
   */
  async getSubnet(vnetName: string, subnetName: string): Promise<Subnet | undefined> {
    try {
      return await this.networkClient.subnets.get(
        this.resourceGroup,
        vnetName,
        subnetName
      );
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        return undefined;
      }
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // NSG Operations
  // ------------------------------------------------------------------

  /**
   * Ensure an NSG exists with the specified rules.
   *
   * @param name - NSG name
   * @param rules - Security rules to apply
   * @param additionalRules - Additional security rules
   * @returns NSG resource
   */
  async ensureNSG(
    name: string,
    rules: SecurityRule[],
    additionalRules?: SecurityRule[]
  ): Promise<NetworkSecurityGroup> {
    // Check if already exists
    try {
      const existing = await this.networkClient.networkSecurityGroups.get(
        this.resourceGroup,
        name
      );
      return existing;
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode !== 404) {
        throw error;
      }
    }

    // Build security rules
    const securityRules = rules.map((rule) => ({
      name: rule.name,
      priority: rule.priority,
      direction: rule.direction,
      access: rule.access,
      protocol: rule.protocol,
      sourceAddressPrefix: rule.sourceAddressPrefix,
      sourcePortRange: "*",
      destinationAddressPrefix: "*",
      destinationPortRange: rule.destinationPortRange,
    }));

    // Add additional rules if provided
    if (additionalRules && additionalRules.length > 0) {
      let priority = 400;
      for (const rule of additionalRules) {
        securityRules.push({
          name: rule.name,
          priority: rule.priority || priority,
          direction: rule.direction,
          access: rule.access,
          protocol: rule.protocol,
          sourceAddressPrefix: rule.sourceAddressPrefix,
          sourcePortRange: "*",
          destinationAddressPrefix: "*",
          destinationPortRange: rule.destinationPortRange,
        });
        priority += 10;
      }
    }

    const result = await this.networkClient.networkSecurityGroups.beginCreateOrUpdateAndWait(
      this.resourceGroup,
      name,
      {
        location: this.location,
        securityRules,
        tags: {
          managedBy: "clawster",
        },
      }
    );

    return result;
  }

  /**
   * Delete an NSG.
   *
   * @param name - NSG name
   */
  async deleteNSG(name: string): Promise<void> {
    try {
      await this.networkClient.networkSecurityGroups.beginDeleteAndWait(
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
   * Get NSG information.
   *
   * @param name - NSG name
   * @returns NSG resource or undefined if not found
   */
  async getNSG(name: string): Promise<NetworkSecurityGroup | undefined> {
    try {
      return await this.networkClient.networkSecurityGroups.get(
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
   * Get default NSG security rules for VM protection.
   * These rules deny all direct inbound by default and allow
   * only VNet internal traffic and Azure Load Balancer probes.
   *
   * @returns Array of default security rules
   */
  static getDefaultSecurityRules(): SecurityRule[] {
    return [
      // Deny all direct inbound by default (traffic must go through App Gateway)
      {
        name: "DenyAllInbound",
        priority: 4096,
        direction: "Inbound",
        access: "Deny",
        protocol: "*",
        sourceAddressPrefix: "*",
        destinationPortRange: "*",
      },
      // Allow outbound to internet (for apt, npm, API calls)
      {
        name: "AllowInternetOutbound",
        priority: 100,
        direction: "Outbound",
        access: "Allow",
        protocol: "*",
        sourceAddressPrefix: "*",
        destinationPortRange: "*",
      },
      // Allow Azure Load Balancer health probes
      {
        name: "AllowAzureLoadBalancer",
        priority: 100,
        direction: "Inbound",
        access: "Allow",
        protocol: "*",
        sourceAddressPrefix: "AzureLoadBalancer",
        destinationPortRange: "*",
      },
      // Allow VNet internal traffic (for App Gateway -> VM)
      {
        name: "AllowVNetInbound",
        priority: 200,
        direction: "Inbound",
        access: "Allow",
        protocol: "*",
        sourceAddressPrefix: "VirtualNetwork",
        destinationPortRange: "*",
      },
      // Allow Application Gateway health probes (65503-65534 range)
      {
        name: "AllowAppGatewayHealthProbes",
        priority: 300,
        direction: "Inbound",
        access: "Allow",
        protocol: "*",
        sourceAddressPrefix: "GatewayManager",
        destinationPortRange: "65200-65535",
      },
    ];
  }

  // ------------------------------------------------------------------
  // Public IP Operations
  // ------------------------------------------------------------------

  /**
   * Create a public IP address.
   *
   * @param name - Public IP name
   * @param dnsLabel - Optional DNS label for FQDN
   * @param sku - SKU (default: "Standard")
   * @param allocationMethod - Allocation method (default: "Static")
   * @returns Public IP resource
   */
  async createPublicIp(
    name: string,
    dnsLabel?: string,
    sku: "Basic" | "Standard" = "Standard",
    allocationMethod: "Static" | "Dynamic" = "Static"
  ): Promise<PublicIPAddress> {
    // Check if already exists
    try {
      const existing = await this.networkClient.publicIPAddresses.get(
        this.resourceGroup,
        name
      );
      return existing;
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode !== 404) {
        throw error;
      }
    }

    const result = await this.networkClient.publicIPAddresses.beginCreateOrUpdateAndWait(
      this.resourceGroup,
      name,
      {
        location: this.location,
        sku: { name: sku },
        publicIPAllocationMethod: allocationMethod,
        dnsSettings: dnsLabel
          ? {
              domainNameLabel: dnsLabel.toLowerCase().replace(/[^a-z0-9-]/g, ""),
            }
          : undefined,
        tags: {
          managedBy: "clawster",
        },
      }
    );

    return result;
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
   * Get public IP address information.
   *
   * @param name - Public IP name
   * @returns Public IP resource or undefined if not found
   */
  async getPublicIp(name: string): Promise<PublicIPAddress | undefined> {
    try {
      return await this.networkClient.publicIPAddresses.get(
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
}
