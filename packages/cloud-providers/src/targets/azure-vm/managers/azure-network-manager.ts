/**
 * Azure Network Manager
 *
 * Handles VNet, Subnet, and NSG operations for Azure VM deployments.
 */

import type { NetworkManagementClient, VirtualNetwork, NetworkSecurityGroup, Subnet } from "@azure/arm-network";
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
   * Ensure an App Gateway subnet exists (no NSG attached).
   */
  async ensureAppGatewaySubnet(
    vnetName: string,
    subnetName: string,
    cidr: string
  ): Promise<Subnet> {
    try {
      const existing = await this.networkClient.subnets.get(this.resourceGroup, vnetName, subnetName);
      return existing;
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        this.log(`  Creating App Gateway subnet: ${subnetName}`);
        // Application Gateway subnet must NOT have NSG attached directly
        const result = await this.networkClient.subnets.beginCreateOrUpdateAndWait(
          this.resourceGroup,
          vnetName,
          subnetName,
          {
            addressPrefix: cidr,
          }
        );
        return result;
      }
      throw error;
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
   * Get default NSG security rules for VM protection.
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
}
