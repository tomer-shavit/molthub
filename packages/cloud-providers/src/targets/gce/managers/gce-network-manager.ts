/**
 * GCE Network Manager
 *
 * Manages VPC networks, subnets, firewall rules, and external IP addresses.
 */

import {
  NetworksClient,
  SubnetworksClient,
  FirewallsClient,
  GlobalAddressesClient,
} from "@google-cloud/compute";
import { GceOperationManager } from "./gce-operation-manager";
import type { VpcOptions, FirewallRule, GceLogCallback } from "../types";

/**
 * Manages GCE networking resources.
 */
export class GceNetworkManager {
  constructor(
    private readonly networksClient: NetworksClient,
    private readonly subnetworksClient: SubnetworksClient,
    private readonly firewallsClient: FirewallsClient,
    private readonly addressesClient: GlobalAddressesClient,
    private readonly operationManager: GceOperationManager,
    private readonly project: string,
    private readonly region: string,
    private readonly log: GceLogCallback
  ) {}

  /**
   * Ensure a VPC network exists, creating it if necessary.
   *
   * @param name - Network name
   * @param options - VPC options
   * @returns Network self-link URL
   */
  async ensureVpcNetwork(name: string, options?: VpcOptions): Promise<string> {
    try {
      const [network] = await this.networksClient.get({
        project: this.project,
        network: name,
      });
      return network.selfLink ?? "";
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) {
        const [operation] = await this.networksClient.insert({
          project: this.project,
          networkResource: {
            name,
            autoCreateSubnetworks: options?.autoCreateSubnetworks ?? false,
            description: options?.description ?? `Clawster VPC network`,
          },
        });
        await this.operationManager.waitForOperation(operation, "global", {
          description: "create VPC network",
        });

        const [network] = await this.networksClient.get({
          project: this.project,
          network: name,
        });
        return network.selfLink ?? "";
      }
      throw error;
    }
  }

  /**
   * Ensure a subnet exists within a VPC network.
   *
   * @param vpcName - VPC network name
   * @param subnetName - Subnet name
   * @param cidr - IP CIDR range (e.g., "10.0.0.0/24")
   * @returns Subnet self-link URL
   */
  async ensureSubnet(vpcName: string, subnetName: string, cidr: string): Promise<string> {
    try {
      const [subnet] = await this.subnetworksClient.get({
        project: this.project,
        region: this.region,
        subnetwork: subnetName,
      });
      return subnet.selfLink ?? "";
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) {
        const [operation] = await this.subnetworksClient.insert({
          project: this.project,
          region: this.region,
          subnetworkResource: {
            name: subnetName,
            network: `projects/${this.project}/global/networks/${vpcName}`,
            ipCidrRange: cidr,
            region: this.region,
            description: `Clawster subnet`,
          },
        });
        await this.operationManager.waitForOperation(operation, "region", {
          description: "create subnet",
        });

        const [subnet] = await this.subnetworksClient.get({
          project: this.project,
          region: this.region,
          subnetwork: subnetName,
        });
        return subnet.selfLink ?? "";
      }
      throw error;
    }
  }

  /**
   * Ensure firewall rules exist for a VPC network.
   *
   * @param name - Firewall rule name
   * @param vpcName - VPC network name
   * @param rules - Firewall rules to create
   */
  async ensureFirewall(name: string, vpcName: string, rules: FirewallRule[]): Promise<void> {
    try {
      await this.firewallsClient.get({
        project: this.project,
        firewall: name,
      });
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) {
        const allowed = rules.map((rule) => ({
          IPProtocol: rule.protocol,
          ports: rule.ports,
        }));

        const sourceRanges = rules.flatMap((rule) => rule.sourceRanges);
        const targetTags = rules.flatMap((rule) => rule.targetTags ?? []);

        const [operation] = await this.firewallsClient.insert({
          project: this.project,
          firewallResource: {
            name,
            network: `projects/${this.project}/global/networks/${vpcName}`,
            description: rules[0]?.description ?? `Clawster firewall rules`,
            allowed,
            sourceRanges: [...new Set(sourceRanges)],
            targetTags: targetTags.length > 0 ? [...new Set(targetTags)] : undefined,
          },
        });
        await this.operationManager.waitForOperation(operation, "global", {
          description: "create firewall rules",
        });
        return;
      }
      throw error;
    }
  }

  /**
   * Ensure an external static IP address exists.
   *
   * @param name - IP address name
   * @returns The allocated IP address
   */
  async ensureExternalIp(name: string): Promise<string> {
    try {
      const [address] = await this.addressesClient.get({
        project: this.project,
        address: name,
      });
      return address.address ?? "";
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) {
        const [operation] = await this.addressesClient.insert({
          project: this.project,
          addressResource: {
            name,
            description: `Clawster external IP`,
            networkTier: "PREMIUM",
          },
        });
        await this.operationManager.waitForOperation(operation, "global", {
          description: "reserve external IP",
        });

        const [address] = await this.addressesClient.get({
          project: this.project,
          address: name,
        });
        return address.address ?? "";
      }
      throw error;
    }
  }

  /**
   * Delete a VPC network.
   */
  async deleteNetwork(name: string): Promise<void> {
    try {
      const [operation] = await this.networksClient.delete({
        project: this.project,
        network: name,
      });
      await this.operationManager.waitForOperation(operation, "global", {
        description: "delete VPC network",
      });
    } catch (error: unknown) {
      if (!this.isNotFoundError(error)) throw error;
    }
  }

  /**
   * Delete a subnet.
   */
  async deleteSubnet(name: string): Promise<void> {
    try {
      const [operation] = await this.subnetworksClient.delete({
        project: this.project,
        region: this.region,
        subnetwork: name,
      });
      await this.operationManager.waitForOperation(operation, "region", {
        description: "delete subnet",
      });
    } catch (error: unknown) {
      if (!this.isNotFoundError(error)) throw error;
    }
  }

  /**
   * Delete a firewall rule.
   */
  async deleteFirewall(name: string): Promise<void> {
    try {
      const [operation] = await this.firewallsClient.delete({
        project: this.project,
        firewall: name,
      });
      await this.operationManager.waitForOperation(operation, "global", {
        description: "delete firewall",
      });
    } catch (error: unknown) {
      if (!this.isNotFoundError(error)) throw error;
    }
  }

  /**
   * Release an external IP address.
   */
  async releaseExternalIp(name: string): Promise<void> {
    try {
      const [operation] = await this.addressesClient.delete({
        project: this.project,
        address: name,
      });
      await this.operationManager.waitForOperation(operation, "global", {
        description: "delete external IP",
      });
    } catch (error: unknown) {
      if (!this.isNotFoundError(error)) throw error;
    }
  }

  /**
   * Get an external IP address value.
   */
  async getExternalIp(name: string): Promise<string> {
    const [address] = await this.addressesClient.get({
      project: this.project,
      address: name,
    });
    return address.address ?? "";
  }

  private isNotFoundError(error: unknown): boolean {
    return (
      error instanceof Error &&
      (error.message.includes("NOT_FOUND") || error.message.includes("404"))
    );
  }
}
