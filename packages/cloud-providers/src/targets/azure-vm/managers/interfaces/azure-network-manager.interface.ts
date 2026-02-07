/**
 * Azure Network Manager Interface
 *
 * Provides abstraction for VNet, Subnet, NSG, and Public IP operations.
 * Enables dependency injection for testing and modularity.
 */

import type { VirtualNetwork, NetworkSecurityGroup, Subnet, PublicIPAddress } from "@azure/arm-network";
import type { SecurityRule } from "../../types";

/**
 * Interface for managing Azure networking resources.
 */
export interface IAzureNetworkManager {
  /**
   * Ensure a VNet exists, creating it if necessary.
   */
  ensureVNet(name: string, cidr?: string): Promise<VirtualNetwork>;

  /**
   * Ensure an NSG exists with the specified rules.
   */
  ensureNSG(
    name: string,
    rules: SecurityRule[],
    additionalRules?: SecurityRule[]
  ): Promise<NetworkSecurityGroup>;

  /**
   * Ensure a VM subnet exists within a VNet.
   */
  ensureVmSubnet(
    vnetName: string,
    subnetName: string,
    cidr: string,
    nsgId: string
  ): Promise<Subnet>;

  /**
   * Ensure a static public IP exists.
   * Standard SKU, static allocation — survives VM restarts.
   */
  ensurePublicIp(name: string): Promise<PublicIPAddress>;

  /**
   * Get the IP address string from a public IP resource.
   */
  getPublicIpAddress(name: string): Promise<string>;

  /**
   * Delete a public IP.
   */
  deletePublicIp(name: string): Promise<void>;

  /**
   * Delete a VNet.
   */
  deleteVNet(name: string): Promise<void>;

  /**
   * Delete an NSG.
   */
  deleteNSG(name: string): Promise<void>;
}
