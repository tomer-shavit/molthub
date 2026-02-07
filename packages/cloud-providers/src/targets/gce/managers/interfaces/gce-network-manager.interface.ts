/**
 * GCE Network Manager Interface
 *
 * Provides abstraction for VPC networks, subnets, and firewall rules.
 * Caddy-on-VM architecture: VMs use ephemeral public IPs (no static IP reservation).
 */

import type { VpcOptions, FirewallRule } from "../../types";

/**
 * Interface for managing GCE networking resources.
 */
export interface IGceNetworkManager {
  /** Ensure a VPC network exists, creating it if necessary. Returns self-link URL. */
  ensureVpcNetwork(name: string, options?: VpcOptions): Promise<string>;

  /** Ensure a subnet exists within a VPC network. Returns self-link URL. */
  ensureSubnet(vpcName: string, subnetName: string, cidr: string): Promise<string>;

  /** Ensure firewall rules exist for a VPC network. */
  ensureFirewall(name: string, vpcName: string, rules: FirewallRule[]): Promise<void>;

  /** Delete a VPC network. */
  deleteNetwork(name: string): Promise<void>;

  /** Delete a subnet. */
  deleteSubnet(name: string): Promise<void>;

  /** Delete a firewall rule. */
  deleteFirewall(name: string): Promise<void>;
}
