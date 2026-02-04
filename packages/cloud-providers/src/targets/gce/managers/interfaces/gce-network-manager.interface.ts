/**
 * GCE Network Manager Interface
 *
 * Provides abstraction for VPC networks, subnets, firewall rules, and external IPs.
 * Enables dependency injection for testing and modularity.
 */

import type { VpcOptions, FirewallRule } from "../../types";

/**
 * Interface for managing GCE networking resources.
 */
export interface IGceNetworkManager {
  /**
   * Ensure a VPC network exists, creating it if necessary.
   *
   * @param name - Network name
   * @param options - VPC options
   * @returns Network self-link URL
   */
  ensureVpcNetwork(name: string, options?: VpcOptions): Promise<string>;

  /**
   * Ensure a subnet exists within a VPC network.
   *
   * @param vpcName - VPC network name
   * @param subnetName - Subnet name
   * @param cidr - IP CIDR range (e.g., "10.0.0.0/24")
   * @returns Subnet self-link URL
   */
  ensureSubnet(vpcName: string, subnetName: string, cidr: string): Promise<string>;

  /**
   * Ensure firewall rules exist for a VPC network.
   *
   * @param name - Firewall rule name
   * @param vpcName - VPC network name
   * @param rules - Firewall rules to create
   */
  ensureFirewall(name: string, vpcName: string, rules: FirewallRule[]): Promise<void>;

  /**
   * Ensure an external static IP address exists.
   *
   * @param name - IP address name
   * @returns The allocated IP address
   */
  ensureExternalIp(name: string): Promise<string>;

  /**
   * Delete a VPC network.
   *
   * @param name - Network name
   */
  deleteNetwork(name: string): Promise<void>;

  /**
   * Delete a subnet.
   *
   * @param name - Subnet name
   */
  deleteSubnet(name: string): Promise<void>;

  /**
   * Delete a firewall rule.
   *
   * @param name - Firewall name
   */
  deleteFirewall(name: string): Promise<void>;

  /**
   * Release an external IP address.
   *
   * @param name - IP address name
   */
  releaseExternalIp(name: string): Promise<void>;

  /**
   * Get an external IP address value.
   *
   * @param name - IP address name
   * @returns The IP address string
   */
  getExternalIp(name: string): Promise<string>;
}
