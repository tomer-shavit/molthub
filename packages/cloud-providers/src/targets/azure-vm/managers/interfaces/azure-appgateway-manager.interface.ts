/**
 * Azure Application Gateway Manager Interface
 *
 * Provides abstraction for Application Gateway, Public IP, and load balancing operations.
 * Enables dependency injection for testing and modularity.
 */

import type { GatewayEndpointInfo } from "../../types";

/**
 * Interface for managing Azure Application Gateway resources.
 */
export interface IAzureAppGatewayManager {
  /**
   * Ensure a static public IP exists for the Application Gateway.
   *
   * @param name - Public IP name
   * @param dnsLabel - DNS label for FQDN
   * @returns IP address and FQDN
   */
  ensurePublicIp(
    name: string,
    dnsLabel: string
  ): Promise<{ ipAddress: string; fqdn: string }>;

  /**
   * Ensure an Application Gateway exists.
   *
   * @param name - Application Gateway name
   * @param subnetId - Subnet resource ID
   * @param publicIpName - Public IP name
   * @param gatewayPort - Backend pool port (gateway port)
   * @param backendPoolName - Optional backend pool name
   */
  ensureAppGateway(
    name: string,
    subnetId: string,
    publicIpName: string,
    gatewayPort: number,
    backendPoolName?: string
  ): Promise<void>;

  /**
   * Update the backend pool with a VM's private IP.
   *
   * @param gatewayName - Application Gateway name
   * @param vmPrivateIp - VM private IP address
   */
  updateBackendPool(gatewayName: string, vmPrivateIp: string): Promise<void>;

  /**
   * Get the Application Gateway's public endpoint information.
   *
   * @param publicIpName - Public IP name
   * @returns Gateway endpoint info (IP and FQDN)
   */
  getGatewayEndpoint(publicIpName: string): Promise<GatewayEndpointInfo>;

  /**
   * Delete an Application Gateway.
   *
   * @param name - Application Gateway name
   */
  deleteAppGateway(name: string): Promise<void>;

  /**
   * Delete a public IP address.
   *
   * @param name - Public IP name
   */
  deletePublicIp(name: string): Promise<void>;

  /**
   * Delete a subnet.
   *
   * @param vnetName - VNet name
   * @param subnetName - Subnet name
   */
  deleteSubnet(vnetName: string, subnetName: string): Promise<void>;
}
