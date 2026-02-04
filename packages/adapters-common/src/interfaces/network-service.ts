/**
 * Network Service Interface
 *
 * Provides abstraction for networking operations across cloud providers.
 * Implemented by AWS VPC Service, Azure VNet Service, GCP Network Service, etc.
 */

import type {
  NetworkResult,
  SubnetResult,
  SecurityRule,
  SecurityGroupResult,
} from "../types/network";

/**
 * Interface for managing network resources across cloud providers.
 */
export interface INetworkService {
  /**
   * Ensure a network (VPC/VNet) exists, creating it if necessary.
   *
   * @param name - Network name
   * @param cidr - IP CIDR range (e.g., "10.0.0.0/16")
   * @returns Network result with ID and metadata
   */
  ensureNetwork(name: string, cidr: string): Promise<NetworkResult>;

  /**
   * Ensure a subnet exists within a network, creating it if necessary.
   *
   * @param networkName - Parent network name or ID
   * @param subnetName - Subnet name
   * @param cidr - IP CIDR range (e.g., "10.0.1.0/24")
   * @returns Subnet result with ID and metadata
   */
  ensureSubnet(
    networkName: string,
    subnetName: string,
    cidr: string
  ): Promise<SubnetResult>;

  /**
   * Ensure a security group (NSG/firewall) exists with the specified rules.
   *
   * @param name - Security group name
   * @param rules - Security rules to apply
   * @returns Security group result with ID and applied rules
   */
  ensureSecurityGroup(
    name: string,
    rules: SecurityRule[]
  ): Promise<SecurityGroupResult>;

  /**
   * Delete a network and all its resources.
   *
   * @param name - Network name or ID
   */
  deleteNetwork(name: string): Promise<void>;
}
