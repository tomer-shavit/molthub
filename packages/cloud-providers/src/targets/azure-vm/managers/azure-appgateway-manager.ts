/**
 * Azure Application Gateway Manager
 *
 * Handles Application Gateway, Public IP, and load balancing operations
 * for Azure VM deployments.
 */

import type { NetworkManagementClient, ApplicationGateway } from "@azure/arm-network";
import type { GatewayEndpointInfo, AzureLogCallback } from "../types";
import type { IAzureAppGatewayManager } from "./interfaces";

export class AzureAppGatewayManager implements IAzureAppGatewayManager {
  constructor(
    private readonly networkClient: NetworkManagementClient,
    private readonly subscriptionId: string,
    private readonly resourceGroup: string,
    private readonly location: string,
    private readonly log: AzureLogCallback
  ) {}

  /**
   * Ensure a static public IP exists for the Application Gateway.
   */
  async ensurePublicIp(
    name: string,
    dnsLabel: string
  ): Promise<{ ipAddress: string; fqdn: string }> {
    try {
      const pip = await this.networkClient.publicIPAddresses.get(this.resourceGroup, name);
      return {
        ipAddress: pip.ipAddress || "",
        fqdn: pip.dnsSettings?.fqdn || "",
      };
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        this.log(`  Creating public IP: ${name}`);
        const pip = await this.networkClient.publicIPAddresses.beginCreateOrUpdateAndWait(
          this.resourceGroup,
          name,
          {
            location: this.location,
            sku: { name: "Standard" },
            publicIPAllocationMethod: "Static",
            dnsSettings: {
              domainNameLabel: dnsLabel.toLowerCase().replace(/[^a-z0-9-]/g, ""),
            },
            tags: {
              managedBy: "clawster",
            },
          }
        );
        return {
          ipAddress: pip.ipAddress || "",
          fqdn: pip.dnsSettings?.fqdn || "",
        };
      }
      throw error;
    }
  }

  /**
   * Ensure an Application Gateway exists.
   */
  async ensureAppGateway(
    name: string,
    subnetId: string,
    publicIpName: string,
    gatewayPort: number,
    backendPoolName: string = "vmBackendPool"
  ): Promise<void> {
    try {
      // Check if already exists
      await this.networkClient.applicationGateways.get(this.resourceGroup, name);
      return;
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode !== 404) {
        throw error;
      }
    }

    this.log(`  Creating Application Gateway: ${name}`);

    const gatewayIpConfigName = "appGatewayIpConfig";
    const frontendIpConfigName = "appGatewayFrontendIp";
    const frontendPortName = "appGatewayFrontendPort";
    const backendHttpSettingsName = "vmBackendHttpSettings";
    const httpListenerName = "vmHttpListener";
    const requestRoutingRuleName = "vmRoutingRule";
    const probeName = "vmHealthProbe";

    const publicIpId = `/subscriptions/${this.subscriptionId}/resourceGroups/${this.resourceGroup}/providers/Microsoft.Network/publicIPAddresses/${publicIpName}`;

    await this.networkClient.applicationGateways.beginCreateOrUpdateAndWait(
      this.resourceGroup,
      name,
      {
        location: this.location,
        sku: {
          name: "Standard_v2",
          tier: "Standard_v2",
          capacity: 1,
        },
        gatewayIPConfigurations: [
          {
            name: gatewayIpConfigName,
            subnet: { id: subnetId },
          },
        ],
        frontendIPConfigurations: [
          {
            name: frontendIpConfigName,
            publicIPAddress: {
              id: publicIpId,
            },
          },
        ],
        frontendPorts: [
          {
            name: frontendPortName,
            port: 80,
          },
        ],
        backendAddressPools: [
          {
            name: backendPoolName,
            backendAddresses: [],
          },
        ],
        probes: [
          {
            name: probeName,
            protocol: "Http",
            path: "/health",
            interval: 30,
            timeout: 30,
            unhealthyThreshold: 3,
            pickHostNameFromBackendHttpSettings: true,
          },
        ],
        backendHttpSettingsCollection: [
          {
            name: backendHttpSettingsName,
            port: gatewayPort,
            protocol: "Http",
            cookieBasedAffinity: "Disabled",
            requestTimeout: 60,
            probe: {
              id: `/subscriptions/${this.subscriptionId}/resourceGroups/${this.resourceGroup}/providers/Microsoft.Network/applicationGateways/${name}/probes/${probeName}`,
            },
          },
        ],
        httpListeners: [
          {
            name: httpListenerName,
            frontendIPConfiguration: {
              id: `/subscriptions/${this.subscriptionId}/resourceGroups/${this.resourceGroup}/providers/Microsoft.Network/applicationGateways/${name}/frontendIPConfigurations/${frontendIpConfigName}`,
            },
            frontendPort: {
              id: `/subscriptions/${this.subscriptionId}/resourceGroups/${this.resourceGroup}/providers/Microsoft.Network/applicationGateways/${name}/frontendPorts/${frontendPortName}`,
            },
            protocol: "Http",
          },
        ],
        requestRoutingRules: [
          {
            name: requestRoutingRuleName,
            ruleType: "Basic",
            priority: 100,
            httpListener: {
              id: `/subscriptions/${this.subscriptionId}/resourceGroups/${this.resourceGroup}/providers/Microsoft.Network/applicationGateways/${name}/httpListeners/${httpListenerName}`,
            },
            backendAddressPool: {
              id: `/subscriptions/${this.subscriptionId}/resourceGroups/${this.resourceGroup}/providers/Microsoft.Network/applicationGateways/${name}/backendAddressPools/${backendPoolName}`,
            },
            backendHttpSettings: {
              id: `/subscriptions/${this.subscriptionId}/resourceGroups/${this.resourceGroup}/providers/Microsoft.Network/applicationGateways/${name}/backendHttpSettingsCollection/${backendHttpSettingsName}`,
            },
          },
        ],
        tags: {
          managedBy: "clawster",
        },
      }
    );
  }

  /**
   * Update the backend pool with a VM's private IP.
   */
  async updateBackendPool(gatewayName: string, vmPrivateIp: string): Promise<void> {
    try {
      const appGw: ApplicationGateway = await this.networkClient.applicationGateways.get(
        this.resourceGroup,
        gatewayName
      );

      if (appGw.backendAddressPools?.[0]) {
        appGw.backendAddressPools[0].backendAddresses = [
          { ipAddress: vmPrivateIp },
        ];
      }

      await this.networkClient.applicationGateways.beginCreateOrUpdateAndWait(
        this.resourceGroup,
        gatewayName,
        appGw
      );
      this.log(`Backend pool updated with IP: ${vmPrivateIp}`);
    } catch {
      // Ignore update failures - the backend may not exist yet
      this.log(`Could not update backend pool (may not exist yet)`, "stderr");
    }
  }

  /**
   * Get the Application Gateway's public endpoint information.
   */
  async getGatewayEndpoint(publicIpName: string): Promise<GatewayEndpointInfo> {
    const pip = await this.networkClient.publicIPAddresses.get(this.resourceGroup, publicIpName);
    return {
      publicIp: pip.ipAddress || "",
      fqdn: pip.dnsSettings?.fqdn || "",
    };
  }

  /**
   * Delete an Application Gateway.
   */
  async deleteAppGateway(name: string): Promise<void> {
    try {
      await this.networkClient.applicationGateways.beginDeleteAndWait(this.resourceGroup, name);
      this.log(`Application Gateway deleted: ${name}`);
    } catch {
      this.log(`Application Gateway not found (skipped): ${name}`);
    }
  }

  /**
   * Delete a public IP address.
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
   * Delete a subnet.
   */
  async deleteSubnet(vnetName: string, subnetName: string): Promise<void> {
    try {
      await this.networkClient.subnets.beginDeleteAndWait(
        this.resourceGroup,
        vnetName,
        subnetName
      );
      this.log(`Subnet deleted: ${subnetName}`);
    } catch {
      this.log(`Subnet not found (skipped): ${subnetName}`);
    }
  }
}
