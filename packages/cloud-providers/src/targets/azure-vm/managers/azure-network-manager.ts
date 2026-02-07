/**
 * Azure Network Manager
 *
 * Handles VNet, Subnet, NSG, and Public IP operations for Azure VM deployments.
 */

import type {
  NetworkManagementClient,
  VirtualNetwork,
  NetworkSecurityGroup,
  Subnet,
  PublicIPAddress,
} from "@azure/arm-network";
import type { SecurityRule, AzureLogCallback } from "../types";
import type { IAzureNetworkManager } from "./interfaces";

const DEFAULT_VNET_PREFIX = "10.0.0.0/16";
const DEFAULT_VM_SUBNET_PREFIX = "10.0.1.0/24";

export class AzureNetworkManager implements IAzureNetworkManager {
  constructor(
    private readonly networkClient: NetworkManagementClient,
    private readonly resourceGroup: string,
    private readonly location: string,
    private readonly log: AzureLogCallback
  ) {}

  /**
   * Ensure a VNet exists, creating it if necessary.
   */
  async ensureVNet(name: string, cidr: string = DEFAULT_VNET_PREFIX): Promise<VirtualNetwork> {
    try {
      const existing = await this.networkClient.virtualNetworks.get(this.resourceGroup, name);
      return existing;
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        this.log(`  Creating VNet: ${name}`);
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
      throw error;
    }
  }

  /**
   * Ensure an NSG exists with the specified rules.
   */
  async ensureNSG(
    name: string,
    rules: SecurityRule[],
    additionalRules?: SecurityRule[]
  ): Promise<NetworkSecurityGroup> {
    try {
      const existing = await this.networkClient.networkSecurityGroups.get(this.resourceGroup, name);
      return existing;
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        this.log(`  Creating NSG: ${name}`);

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
      throw error;
    }
  }

  /**
   * Ensure a VM subnet exists within a VNet.
   */
  async ensureVmSubnet(
    vnetName: string,
    subnetName: string,
    cidr: string = DEFAULT_VM_SUBNET_PREFIX,
    nsgId: string
  ): Promise<Subnet> {
    try {
      const existing = await this.networkClient.subnets.get(this.resourceGroup, vnetName, subnetName);
      return existing;
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        this.log(`  Creating VM subnet: ${subnetName}`);
        const result = await this.networkClient.subnets.beginCreateOrUpdateAndWait(
          this.resourceGroup,
          vnetName,
          subnetName,
          {
            addressPrefix: cidr,
            networkSecurityGroup: {
              id: nsgId,
            },
          }
        );
        return result;
      }
      throw error;
    }
  }

  /**
   * Ensure a static public IP exists (Standard SKU, static allocation).
   * Static IP survives VM restarts and deallocations — critical for webhook URLs.
   */
  async ensurePublicIp(name: string): Promise<PublicIPAddress> {
    try {
      const existing = await this.networkClient.publicIPAddresses.get(this.resourceGroup, name);
      return existing;
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        this.log(`  Creating static public IP: ${name}`);
        const result = await this.networkClient.publicIPAddresses.beginCreateOrUpdateAndWait(
          this.resourceGroup,
          name,
          {
            location: this.location,
            sku: { name: "Standard" },
            publicIPAllocationMethod: "Static",
            tags: {
              managedBy: "clawster",
            },
          }
        );
        return result;
      }
      throw error;
    }
  }

  /**
   * Get the IP address string from a public IP resource.
   */
  async getPublicIpAddress(name: string): Promise<string> {
    const pip = await this.networkClient.publicIPAddresses.get(this.resourceGroup, name);
    if (!pip.ipAddress) {
      throw new Error(`Public IP ${name} has no allocated address`);
    }
    return pip.ipAddress;
  }

  /**
   * Delete a public IP.
   */
  async deletePublicIp(name: string): Promise<void> {
    try {
      await this.networkClient.publicIPAddresses.beginDeleteAndWait(this.resourceGroup, name);
      this.log(`Public IP deleted: ${name}`);
    } catch {
      this.log(`Public IP not found (skipped): ${name}`);
    }
  }

  /**
   * Delete a VNet.
   */
  async deleteVNet(name: string): Promise<void> {
    try {
      await this.networkClient.virtualNetworks.beginDeleteAndWait(this.resourceGroup, name);
      this.log(`VNet deleted: ${name}`);
    } catch {
      this.log(`VNet not found (skipped): ${name}`);
    }
  }

  /**
   * Delete an NSG.
   */
  async deleteNSG(name: string): Promise<void> {
    try {
      await this.networkClient.networkSecurityGroups.beginDeleteAndWait(this.resourceGroup, name);
      this.log(`NSG deleted: ${name}`);
    } catch {
      this.log(`NSG not found (skipped): ${name}`);
    }
  }

  /**
   * Get default NSG security rules for Caddy VM architecture.
   *
   * Allows HTTP/HTTPS from Internet (Caddy handles TLS + reverse proxy).
   * All other inbound is denied by Azure's built-in default deny rule.
   */
  static getDefaultSecurityRules(): SecurityRule[] {
    return [
      // Allow HTTP from Internet (Caddy listens on :80)
      {
        name: "AllowHTTP",
        priority: 100,
        direction: "Inbound",
        access: "Allow",
        protocol: "Tcp",
        sourceAddressPrefix: "Internet",
        destinationPortRange: "80",
      },
      // Allow HTTPS from Internet (Caddy auto-HTTPS on :443 when domain set)
      {
        name: "AllowHTTPS",
        priority: 110,
        direction: "Inbound",
        access: "Allow",
        protocol: "Tcp",
        sourceAddressPrefix: "Internet",
        destinationPortRange: "443",
      },
      // Allow outbound to internet (for apt, npm, Docker Hub, API calls)
      {
        name: "AllowInternetOutbound",
        priority: 100,
        direction: "Outbound",
        access: "Allow",
        protocol: "*",
        sourceAddressPrefix: "*",
        destinationPortRange: "*",
      },
    ];
  }
}
