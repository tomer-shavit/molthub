/**
 * Azure Network Manager Interface
 *
 * Provides abstraction for VNet, Subnet, and NSG operations.
 * Enables dependency injection for testing and modularity.
 */

import type { VirtualNetwork, NetworkSecurityGroup, Subnet } from "@azure/arm-network";
import type { SecurityRule } from "../../types";

/**
 * Interface for managing Azure networking resources.
 */
export interface IAzureNetworkManager {
  /**
   * Ensure a VNet exists, creating it if necessary.
   *
   * @param name - VNet name
   * @param cidr - IP CIDR range (default: "10.0.0.0/16")
   * @returns VNet resource
   */
  ensureVNet(name: string, cidr?: string): Promise<VirtualNetwork>;

  /**
   * Ensure an NSG exists with the specified rules.
   *
   * @param name - NSG name
   * @param rules - Security rules to apply
   * @param additionalRules - Additional security rules
   * @returns NSG resource
   */
  ensureNSG(
    name: string,
    rules: SecurityRule[],
    additionalRules?: SecurityRule[]
  ): Promise<NetworkSecurityGroup>;

  /**
   * Ensure a VM subnet exists within a VNet.
   *
   * @param vnetName - VNet name
   * @param subnetName - Subnet name
   * @param cidr - IP CIDR range
   * @param nsgId - NSG resource ID to attach
   * @returns Subnet resource
   */
  ensureVmSubnet(
    vnetName: string,
    subnetName: string,
    cidr: string,
    nsgId: string
  ): Promise<Subnet>;

  /**
   * Ensure an App Gateway subnet exists (no NSG attached).
   *
   * @param vnetName - VNet name
   * @param subnetName - Subnet name
   * @param cidr - IP CIDR range
   * @returns Subnet resource
   */
  ensureAppGatewaySubnet(
    vnetName: string,
    subnetName: string,
    cidr: string
  ): Promise<Subnet>;

  /**
   * Delete a VNet.
   *
   * @param name - VNet name
   */
  deleteVNet(name: string): Promise<void>;

  /**
   * Delete an NSG.
   *
   * @param name - NSG name
   */
  deleteNSG(name: string): Promise<void>;
}
