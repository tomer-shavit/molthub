/**
 * GCE Network Manager
 *
 * Manages VPC networks, subnets, and firewall rules.
 * Caddy-on-VM architecture: VMs use ephemeral public IPs (no static IP reservation).
 */

import {
  NetworksClient,
  SubnetworksClient,
  FirewallsClient,
} from "@google-cloud/compute";
import type { VpcOptions, FirewallRule, GceLogCallback } from "../types";
import type { IGceNetworkManager, IGceOperationManager } from "./interfaces";

/**
 * Manages GCE networking resources.
 */
export class GceNetworkManager implements IGceNetworkManager {
  constructor(
    private readonly networksClient: NetworksClient,
    private readonly subnetworksClient: SubnetworksClient,
    private readonly firewallsClient: FirewallsClient,
    private readonly operationManager: IGceOperationManager,
    private readonly project: string,
    private readonly region: string,
    private readonly log: GceLogCallback
  ) {}

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
            description: options?.description ?? "Clawster VPC network",
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
            description: "Clawster subnet",
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

  async ensureFirewall(name: string, vpcName: string, rules: FirewallRule[]): Promise<void> {
    // SECURITY: Validate that all rules share the same sourceRanges.
    // GCE firewall resources apply sourceRanges globally to ALL allowed entries (OR logic).
    // Mixing 0.0.0.0/0 (HTTP) with 35.235.240.0/20 (SSH) in one resource exposes SSH to the internet.
    if (rules.length > 1) {
      const firstRanges = JSON.stringify([...rules[0].sourceRanges].sort());
      for (const rule of rules.slice(1)) {
        if (JSON.stringify([...rule.sourceRanges].sort()) !== firstRanges) {
          throw new Error(
            "Cannot create a single GCE firewall with different sourceRanges per rule. " +
            "GCE applies sourceRanges globally to all allowed entries. " +
            "Use separate ensureFirewall() calls for rules with different source ranges."
          );
        }
      }
    }

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
            description: rules[0]?.description ?? "Clawster firewall rules",
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

  private isNotFoundError(error: unknown): boolean {
    return (
      error instanceof Error &&
      (error.message.includes("NOT_FOUND") || error.message.includes("404"))
    );
  }
}
