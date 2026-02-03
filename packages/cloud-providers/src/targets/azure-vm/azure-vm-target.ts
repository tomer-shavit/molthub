import { ComputeManagementClient } from "@azure/arm-compute";
import { NetworkManagementClient } from "@azure/arm-network";
import { DefaultAzureCredential, ClientSecretCredential, TokenCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { LogsQueryClient } from "@azure/monitor-query";
import {
  DeploymentTarget,
  DeploymentTargetType,
  InstallOptions,
  InstallResult,
  OpenClawConfigPayload,
  ConfigureResult,
  TargetStatus,
  DeploymentLogOptions,
  GatewayEndpoint,
} from "../../interface/deployment-target";
import type { ResourceSpec, ResourceUpdateResult } from "../../interface/resource-spec";
import { AZURE_TIER_SPECS } from "../../interface/resource-spec";
import type { AzureVmConfig } from "./azure-vm-config";

const DEFAULT_VM_SIZE = "Standard_B2s";
const DEFAULT_OS_DISK_SIZE_GB = 30;
const DEFAULT_DATA_DISK_SIZE_GB = 10;
const DEFAULT_VNET_PREFIX = "10.0.0.0/16";
const DEFAULT_VM_SUBNET_PREFIX = "10.0.1.0/24";
const DEFAULT_APPGW_SUBNET_PREFIX = "10.0.2.0/24";

/**
 * AzureVmTarget manages an OpenClaw gateway instance running on
 * Azure Virtual Machine.
 *
 * ARCHITECTURE: VM-based deployment with full Docker support.
 * Unlike ACI, Azure VM provides:
 * - Full Docker daemon access for sandbox mode (Docker-in-Docker)
 * - Managed Disk for WhatsApp sessions (survives restarts)
 * - No cold starts - VM is always running
 * - State survives VM restarts
 *
 * Security:
 *   Internet -> Application Gateway -> Azure VM (VNet-isolated)
 *                                          |
 *                                    Managed Disk (persistent storage)
 */
export class AzureVmTarget implements DeploymentTarget {
  readonly type = DeploymentTargetType.AZURE_VM;

  private readonly config: AzureVmConfig;
  private readonly vmSize: string;
  private readonly osDiskSizeGb: number;
  private readonly dataDiskSizeGb: number;
  private readonly credential: TokenCredential;

  private readonly computeClient: ComputeManagementClient;
  private readonly networkClient: NetworkManagementClient;
  private readonly keyVaultClient?: SecretClient;
  private readonly logsClient?: LogsQueryClient;

  /** Derived resource names - set during install */
  private vmName = "";
  private dataDiskName = "";
  private nicName = "";
  private vnetName = "";
  private subnetName = "";
  private nsgName = "";
  private secretName = "";
  private gatewayPort = 18789;

  /** Application Gateway resources */
  private appGatewayName = "";
  private appGatewaySubnetName = "";
  private appGatewayPublicIpName = "";
  private appGatewayPublicIp = "";
  private appGatewayFqdn = "";

  /** Log callback for streaming progress to the UI */
  private onLog?: (line: string, stream: "stdout" | "stderr") => void;

  constructor(config: AzureVmConfig) {
    this.config = config;
    this.vmSize = config.vmSize ?? DEFAULT_VM_SIZE;
    this.osDiskSizeGb = config.osDiskSizeGb ?? DEFAULT_OS_DISK_SIZE_GB;
    this.dataDiskSizeGb = config.dataDiskSizeGb ?? DEFAULT_DATA_DISK_SIZE_GB;

    // Create credential
    if (config.clientId && config.clientSecret && config.tenantId) {
      this.credential = new ClientSecretCredential(
        config.tenantId,
        config.clientId,
        config.clientSecret
      );
    } else {
      this.credential = new DefaultAzureCredential();
    }

    this.computeClient = new ComputeManagementClient(
      this.credential,
      config.subscriptionId
    );

    this.networkClient = new NetworkManagementClient(
      this.credential,
      config.subscriptionId
    );

    // Initialize Key Vault client if configured
    if (config.keyVaultName) {
      const vaultUrl = `https://${config.keyVaultName}.vault.azure.net`;
      this.keyVaultClient = new SecretClient(vaultUrl, this.credential);
    }

    // Initialize Logs client if Log Analytics is configured
    if (config.logAnalyticsWorkspaceId) {
      this.logsClient = new LogsQueryClient(this.credential);
    }

    // Derive resource names from profileName if available
    if (config.profileName) {
      this.deriveResourceNames(config.profileName);
    }
  }

  // ------------------------------------------------------------------
  // Log streaming
  // ------------------------------------------------------------------

  setLogCallback(cb: (line: string, stream: "stdout" | "stderr") => void): void {
    this.onLog = cb;
  }

  /**
   * Emit a log line to the streaming callback (if registered).
   * Used to provide real-time feedback during long-running operations.
   */
  private log(message: string, stream: "stdout" | "stderr" = "stdout"): void {
    this.onLog?.(message, stream);
  }

  // ------------------------------------------------------------------
  // Resource name helpers
  // ------------------------------------------------------------------

  private deriveResourceNames(profileName: string): void {
    const sanitized = this.sanitizeName(profileName);
    this.vmName = `clawster-${sanitized}`;
    this.dataDiskName = `clawster-data-${sanitized}`;
    this.nicName = `clawster-nic-${sanitized}`;
    this.vnetName = this.config.vnetName ?? `clawster-vnet-${sanitized}`;
    this.subnetName = this.config.subnetName ?? `clawster-subnet-${sanitized}`;
    this.nsgName = this.config.nsgName ?? `clawster-nsg-${sanitized}`;
    this.secretName = `clawster-${sanitized}-config`;

    // Application Gateway names
    this.appGatewayName = this.config.appGatewayName ?? `clawster-appgw-${sanitized}`;
    this.appGatewaySubnetName = this.config.appGatewaySubnetName ?? `clawster-appgw-subnet-${sanitized}`;
    this.appGatewayPublicIpName = `clawster-appgw-pip-${sanitized}`;
  }

  /**
   * Sanitize name for Azure resources.
   * Must be lowercase, alphanumeric and hyphens, max 63 characters.
   */
  private sanitizeName(name: string): string {
    const sanitized = name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 63);

    if (!sanitized) {
      throw new Error(`Invalid name: "${name}" produces empty sanitized value`);
    }
    return sanitized;
  }

  // ------------------------------------------------------------------
  // install
  // ------------------------------------------------------------------

  async install(options: InstallOptions): Promise<InstallResult> {
    const profileName = this.sanitizeName(options.profileName);
    this.gatewayPort = options.port;
    this.deriveResourceNames(profileName);

    this.log(`Starting Azure VM installation for ${profileName}`);
    this.log(`Region: ${this.config.region}, VM Size: ${this.vmSize}`);

    try {
      // 1. Set up VNet infrastructure
      this.log(`[1/6] Setting up network infrastructure...`);
      await this.ensureNetworkInfrastructure();
      this.log(`Network infrastructure ready`);

      // 2. Set up Application Gateway for secure external access
      this.log(`[2/6] Setting up Application Gateway...`);
      await this.ensureApplicationGateway();
      this.log(`Application Gateway ready`);

      // 3. Create data disk for persistent storage
      this.log(`[3/6] Creating data disk: ${this.dataDiskName} (${this.dataDiskSizeGb}GB)`);
      await this.ensureDataDisk();
      this.log(`Data disk ready`);

      // 4. Store initial empty config in Key Vault if available
      if (this.keyVaultClient) {
        this.log(`[4/6] Storing config in Key Vault: ${this.secretName}`);
        await this.ensureSecret(this.secretName, "{}");
        this.log(`Key Vault secret created`);
      } else {
        this.log(`[4/6] Key Vault not configured (skipped)`);
      }

      // 5. Create VM with Docker and startup script
      this.log(`[5/6] Creating VM: ${this.vmName}`);
      await this.createVm(options);
      this.log(`VM created`);

      // 6. Update Application Gateway backend with VM's private IP
      this.log(`[6/6] Updating Application Gateway backend...`);
      const vmPrivateIp = await this.getVmPrivateIp();
      if (vmPrivateIp) {
        await this.updateAppGatewayBackend(vmPrivateIp);
        this.log(`Application Gateway backend updated with IP: ${vmPrivateIp}`);
      } else {
        this.log(`Could not determine VM private IP`, "stderr");
      }

      this.log(`Azure VM installation complete!`);

      const externalAccess = this.appGatewayFqdn
        ? ` External access via: http://${this.appGatewayFqdn}`
        : "";

      return {
        success: true,
        instanceId: this.vmName,
        message: `Azure VM "${this.vmName}" created (VNet + App Gateway, managed disk) in ${this.config.region}.${externalAccess}`,
        serviceName: this.vmName,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(`Azure VM install failed: ${errorMsg}`, "stderr");
      return {
        success: false,
        instanceId: this.vmName,
        message: `Azure VM install failed: ${errorMsg}`,
      };
    }
  }

  // ------------------------------------------------------------------
  // Network Infrastructure
  // ------------------------------------------------------------------

  private async ensureNetworkInfrastructure(): Promise<void> {
    // 1. Create or get VNet
    this.log(`  Creating/verifying VNet: ${this.vnetName}`);
    await this.ensureVNet();

    // 2. Create or get NSG with secure rules
    this.log(`  Creating/verifying NSG: ${this.nsgName}`);
    await this.ensureNSG();

    // 3. Create or get subnet for VM
    this.log(`  Creating/verifying subnet: ${this.subnetName}`);
    await this.ensureVmSubnet();
  }

  private async ensureVNet(): Promise<void> {
    const vnetAddressPrefix = this.config.vnetAddressPrefix ?? DEFAULT_VNET_PREFIX;

    try {
      await this.networkClient.virtualNetworks.get(
        this.config.resourceGroup,
        this.vnetName
      );
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        await this.networkClient.virtualNetworks.beginCreateOrUpdateAndWait(
          this.config.resourceGroup,
          this.vnetName,
          {
            location: this.config.region,
            addressSpace: {
              addressPrefixes: [vnetAddressPrefix],
            },
            tags: {
              managedBy: "clawster",
            },
          }
        );
      } else {
        throw error;
      }
    }
  }

  private async ensureNSG(): Promise<void> {
    try {
      await this.networkClient.networkSecurityGroups.get(
        this.config.resourceGroup,
        this.nsgName
      );
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        type SecurityRule = {
          name: string;
          priority: number;
          direction: "Inbound" | "Outbound";
          access: "Allow" | "Deny";
          protocol: "*" | "Tcp" | "Udp";
          sourceAddressPrefix: string;
          sourcePortRange: string;
          destinationAddressPrefix: string;
          destinationPortRange: string;
        };

        const securityRules: SecurityRule[] = [
          // Deny all direct inbound by default (traffic must go through App Gateway)
          {
            name: "DenyAllInbound",
            priority: 4096,
            direction: "Inbound" as const,
            access: "Deny" as const,
            protocol: "*" as const,
            sourceAddressPrefix: "*",
            sourcePortRange: "*",
            destinationAddressPrefix: "*",
            destinationPortRange: "*",
          },
          // Allow outbound to internet (for apt, npm, API calls)
          {
            name: "AllowInternetOutbound",
            priority: 100,
            direction: "Outbound" as const,
            access: "Allow" as const,
            protocol: "*" as const,
            sourceAddressPrefix: "*",
            sourcePortRange: "*",
            destinationAddressPrefix: "Internet",
            destinationPortRange: "*",
          },
          // Allow Azure Load Balancer health probes
          {
            name: "AllowAzureLoadBalancer",
            priority: 100,
            direction: "Inbound" as const,
            access: "Allow" as const,
            protocol: "*" as const,
            sourceAddressPrefix: "AzureLoadBalancer",
            sourcePortRange: "*",
            destinationAddressPrefix: "*",
            destinationPortRange: "*",
          },
          // Allow VNet internal traffic (for App Gateway -> VM)
          {
            name: "AllowVNetInbound",
            priority: 200,
            direction: "Inbound" as const,
            access: "Allow" as const,
            protocol: "*" as const,
            sourceAddressPrefix: "VirtualNetwork",
            sourcePortRange: "*",
            destinationAddressPrefix: "VirtualNetwork",
            destinationPortRange: "*",
          },
          // Allow Application Gateway health probes (65503-65534 range)
          {
            name: "AllowAppGatewayHealthProbes",
            priority: 300,
            direction: "Inbound" as const,
            access: "Allow" as const,
            protocol: "*" as const,
            sourceAddressPrefix: "GatewayManager",
            sourcePortRange: "*",
            destinationAddressPrefix: "*",
            destinationPortRange: "65200-65535",
          },
        ];

        // Add additional NSG rules if configured
        if (this.config.additionalNsgRules) {
          let priority = 400;
          for (const rule of this.config.additionalNsgRules) {
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

        await this.networkClient.networkSecurityGroups.beginCreateOrUpdateAndWait(
          this.config.resourceGroup,
          this.nsgName,
          {
            location: this.config.region,
            securityRules,
            tags: {
              managedBy: "clawster",
            },
          }
        );
      } else {
        throw error;
      }
    }
  }

  private async ensureVmSubnet(): Promise<void> {
    const subnetAddressPrefix = this.config.subnetAddressPrefix ?? DEFAULT_VM_SUBNET_PREFIX;

    const nsg = await this.networkClient.networkSecurityGroups.get(
      this.config.resourceGroup,
      this.nsgName
    );

    try {
      await this.networkClient.subnets.get(
        this.config.resourceGroup,
        this.vnetName,
        this.subnetName
      );
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        await this.networkClient.subnets.beginCreateOrUpdateAndWait(
          this.config.resourceGroup,
          this.vnetName,
          this.subnetName,
          {
            addressPrefix: subnetAddressPrefix,
            networkSecurityGroup: {
              id: nsg.id,
            },
          }
        );
      } else {
        throw error;
      }
    }
  }

  // ------------------------------------------------------------------
  // Application Gateway
  // ------------------------------------------------------------------

  private async ensureApplicationGateway(): Promise<void> {
    this.log(`  Creating/verifying App Gateway subnet: ${this.appGatewaySubnetName}`);
    await this.ensureAppGatewaySubnet();

    this.log(`  Creating/verifying App Gateway public IP: ${this.appGatewayPublicIpName}`);
    await this.ensureAppGatewayPublicIp();

    this.log(`  Creating/verifying Application Gateway: ${this.appGatewayName}`);
    await this.createApplicationGateway();
  }

  private async ensureAppGatewaySubnet(): Promise<void> {
    const subnetAddressPrefix = this.config.appGatewaySubnetAddressPrefix ?? DEFAULT_APPGW_SUBNET_PREFIX;

    try {
      await this.networkClient.subnets.get(
        this.config.resourceGroup,
        this.vnetName,
        this.appGatewaySubnetName
      );
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        // Application Gateway subnet must NOT have NSG attached directly
        await this.networkClient.subnets.beginCreateOrUpdateAndWait(
          this.config.resourceGroup,
          this.vnetName,
          this.appGatewaySubnetName,
          {
            addressPrefix: subnetAddressPrefix,
          }
        );
      } else {
        throw error;
      }
    }
  }

  private async ensureAppGatewayPublicIp(): Promise<void> {
    try {
      const pip = await this.networkClient.publicIPAddresses.get(
        this.config.resourceGroup,
        this.appGatewayPublicIpName
      );
      this.appGatewayPublicIp = pip.ipAddress || "";
      this.appGatewayFqdn = pip.dnsSettings?.fqdn || "";
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        const pip = await this.networkClient.publicIPAddresses.beginCreateOrUpdateAndWait(
          this.config.resourceGroup,
          this.appGatewayPublicIpName,
          {
            location: this.config.region,
            sku: { name: "Standard" },
            publicIPAllocationMethod: "Static",
            dnsSettings: {
              domainNameLabel: this.appGatewayName.toLowerCase().replace(/[^a-z0-9-]/g, ""),
            },
            tags: {
              managedBy: "clawster",
            },
          }
        );
        this.appGatewayPublicIp = pip.ipAddress || "";
        this.appGatewayFqdn = pip.dnsSettings?.fqdn || "";
      } else {
        throw error;
      }
    }
  }

  private async createApplicationGateway(): Promise<void> {
    try {
      const existingGw = await this.networkClient.applicationGateways.get(
        this.config.resourceGroup,
        this.appGatewayName
      );
      if (existingGw.frontendIPConfigurations?.[0]?.publicIPAddress?.id) {
        const pip = await this.networkClient.publicIPAddresses.get(
          this.config.resourceGroup,
          this.appGatewayPublicIpName
        );
        this.appGatewayPublicIp = pip.ipAddress || "";
        this.appGatewayFqdn = pip.dnsSettings?.fqdn || "";
      }
      return;
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode !== 404) {
        throw error;
      }
    }

    // Get subnet ID for Application Gateway
    const appGwSubnet = await this.networkClient.subnets.get(
      this.config.resourceGroup,
      this.vnetName,
      this.appGatewaySubnetName
    );

    const subscriptionId = this.config.subscriptionId;
    const resourceGroup = this.config.resourceGroup;
    const gatewayIpConfigName = "appGatewayIpConfig";
    const frontendIpConfigName = "appGatewayFrontendIp";
    const frontendPortName = "appGatewayFrontendPort";
    const backendPoolName = "vmBackendPool";
    const backendHttpSettingsName = "vmBackendHttpSettings";
    const httpListenerName = "vmHttpListener";
    const requestRoutingRuleName = "vmRoutingRule";
    const probeName = "vmHealthProbe";

    await this.networkClient.applicationGateways.beginCreateOrUpdateAndWait(
      resourceGroup,
      this.appGatewayName,
      {
        location: this.config.region,
        sku: {
          name: "Standard_v2",
          tier: "Standard_v2",
          capacity: 1,
        },
        gatewayIPConfigurations: [
          {
            name: gatewayIpConfigName,
            subnet: { id: appGwSubnet.id },
          },
        ],
        frontendIPConfigurations: [
          {
            name: frontendIpConfigName,
            publicIPAddress: {
              id: `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/publicIPAddresses/${this.appGatewayPublicIpName}`,
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
            port: this.gatewayPort,
            protocol: "Http",
            cookieBasedAffinity: "Disabled",
            requestTimeout: 60,
            probe: {
              id: `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/applicationGateways/${this.appGatewayName}/probes/${probeName}`,
            },
          },
        ],
        httpListeners: [
          {
            name: httpListenerName,
            frontendIPConfiguration: {
              id: `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/applicationGateways/${this.appGatewayName}/frontendIPConfigurations/${frontendIpConfigName}`,
            },
            frontendPort: {
              id: `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/applicationGateways/${this.appGatewayName}/frontendPorts/${frontendPortName}`,
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
              id: `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/applicationGateways/${this.appGatewayName}/httpListeners/${httpListenerName}`,
            },
            backendAddressPool: {
              id: `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/applicationGateways/${this.appGatewayName}/backendAddressPools/${backendPoolName}`,
            },
            backendHttpSettings: {
              id: `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/applicationGateways/${this.appGatewayName}/backendHttpSettingsCollection/${backendHttpSettingsName}`,
            },
          },
        ],
        tags: {
          managedBy: "clawster",
        },
      }
    );
  }

  private async updateAppGatewayBackend(vmPrivateIp: string): Promise<void> {
    try {
      const appGw = await this.networkClient.applicationGateways.get(
        this.config.resourceGroup,
        this.appGatewayName
      );

      if (appGw.backendAddressPools?.[0]) {
        appGw.backendAddressPools[0].backendAddresses = [
          { ipAddress: vmPrivateIp },
        ];
      }

      await this.networkClient.applicationGateways.beginCreateOrUpdateAndWait(
        this.config.resourceGroup,
        this.appGatewayName,
        appGw
      );
    } catch {
      // Ignore Application Gateway backend update failures - the backend may not exist yet
    }
  }

  // ------------------------------------------------------------------
  // Data Disk
  // ------------------------------------------------------------------

  private async ensureDataDisk(): Promise<void> {
    try {
      await this.computeClient.disks.get(
        this.config.resourceGroup,
        this.dataDiskName
      );
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        await this.computeClient.disks.beginCreateOrUpdateAndWait(
          this.config.resourceGroup,
          this.dataDiskName,
          {
            location: this.config.region,
            sku: { name: "Standard_LRS" },
            diskSizeGB: this.dataDiskSizeGb,
            creationData: {
              createOption: "Empty",
            },
            tags: {
              managedBy: "clawster",
            },
          }
        );
      } else {
        throw error;
      }
    }
  }

  // ------------------------------------------------------------------
  // VM Creation
  // ------------------------------------------------------------------

  private async createVm(options: InstallOptions): Promise<void> {
    const imageUri = this.config.image ?? "node:22-slim";

    // Get subnet for NIC
    const subnet = await this.networkClient.subnets.get(
      this.config.resourceGroup,
      this.vnetName,
      this.subnetName
    );

    // Create NIC (no public IP - traffic goes through App Gateway)
    try {
      await this.networkClient.networkInterfaces.get(
        this.config.resourceGroup,
        this.nicName
      );
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        await this.networkClient.networkInterfaces.beginCreateOrUpdateAndWait(
          this.config.resourceGroup,
          this.nicName,
          {
            location: this.config.region,
            ipConfigurations: [
              {
                name: "ipconfig1",
                subnet: { id: subnet.id },
                privateIPAllocationMethod: "Dynamic",
                // No public IP - VM is only accessible via Application Gateway
              },
            ],
            tags: {
              managedBy: "clawster",
            },
          }
        );
      } else {
        throw error;
      }
    }

    // Get NIC ID
    const nic = await this.networkClient.networkInterfaces.get(
      this.config.resourceGroup,
      this.nicName
    );

    // Get data disk ID
    const dataDisk = await this.computeClient.disks.get(
      this.config.resourceGroup,
      this.dataDiskName
    );

    // Build cloud-init script for Docker setup and OpenClaw startup
    const cloudInit = this.buildCloudInit(imageUri, options);

    // Create VM
    await this.computeClient.virtualMachines.beginCreateOrUpdateAndWait(
      this.config.resourceGroup,
      this.vmName,
      {
        location: this.config.region,
        hardwareProfile: {
          vmSize: this.vmSize,
        },
        storageProfile: {
          imageReference: {
            // Ubuntu 24.04 LTS
            publisher: "Canonical",
            offer: "ubuntu-24_04-lts",
            sku: "server",
            version: "latest",
          },
          osDisk: {
            createOption: "FromImage",
            diskSizeGB: this.osDiskSizeGb,
            managedDisk: {
              storageAccountType: "Standard_LRS",
            },
            name: `${this.vmName}-osdisk`,
          },
          dataDisks: [
            {
              lun: 0,
              createOption: "Attach",
              managedDisk: {
                id: dataDisk.id,
              },
            },
          ],
        },
        osProfile: {
          computerName: this.vmName,
          adminUsername: "clawster",
          customData: Buffer.from(cloudInit).toString("base64"),
          linuxConfiguration: {
            disablePasswordAuthentication: true,
            ssh: this.config.sshPublicKey
              ? {
                  publicKeys: [
                    {
                      path: "/home/clawster/.ssh/authorized_keys",
                      keyData: this.config.sshPublicKey,
                    },
                  ],
                }
              : undefined,
          },
        },
        networkProfile: {
          networkInterfaces: [
            {
              id: nic.id,
              primary: true,
            },
          ],
        },
        tags: {
          managedBy: "clawster",
          profile: this.sanitizeName(options.profileName),
        },
      }
    );
  }

  private buildCloudInit(imageUri: string, options: InstallOptions): string {
    const gatewayToken = options.gatewayAuthToken ?? "";

    return `#cloud-config
package_update: true
package_upgrade: true

packages:
  - docker.io
  - jq
  - curl

runcmd:
  # Enable and start Docker
  - systemctl enable docker
  - systemctl start docker
  - usermod -aG docker clawster

  # Format and mount data disk
  - mkdir -p /mnt/openclaw
  - |
    DATA_DISK="/dev/disk/azure/scsi1/lun0"
    if [ -e "$DATA_DISK" ]; then
      if ! blkid "$DATA_DISK"; then
        mkfs.ext4 -F "$DATA_DISK"
      fi
      mount "$DATA_DISK" /mnt/openclaw
      echo "$DATA_DISK /mnt/openclaw ext4 defaults,nofail 0 2" >> /etc/fstab
    fi
  - chmod 777 /mnt/openclaw
  - mkdir -p /mnt/openclaw/.openclaw

  # Install Sysbox runtime for secure Docker-in-Docker (sandbox mode)
  # Using versioned release for stability and security
  - |
    SYSBOX_VERSION="v0.6.4"
    if ! docker info --format '{{json .Runtimes}}' 2>/dev/null | grep -q 'sysbox-runc'; then
      echo "Installing Sysbox $SYSBOX_VERSION for secure sandbox mode..."
      SYSBOX_INSTALL_SCRIPT="/tmp/sysbox-install-$$.sh"
      curl -fsSL "https://raw.githubusercontent.com/nestybox/sysbox/$SYSBOX_VERSION/scr/install.sh" -o "$SYSBOX_INSTALL_SCRIPT"
      chmod +x "$SYSBOX_INSTALL_SCRIPT"
      "$SYSBOX_INSTALL_SCRIPT"
      rm -f "$SYSBOX_INSTALL_SCRIPT"
      systemctl restart docker
      echo "Sysbox runtime installed successfully"
    else
      echo "Sysbox runtime already available"
    fi

  # Write initial config
  - echo '{}' > /mnt/openclaw/.openclaw/openclaw.json

  # Stop any existing container
  - docker rm -f openclaw-gateway 2>/dev/null || true

  # Determine which runtime to use and run OpenClaw
  - |
    DOCKER_RUNTIME=""
    if docker info --format '{{json .Runtimes}}' 2>/dev/null | grep -q 'sysbox-runc'; then
      DOCKER_RUNTIME="--runtime=sysbox-runc"
      echo "Using Sysbox runtime for secure Docker-in-Docker"
    else
      echo "Warning: Sysbox not available, sandbox mode will be limited"
    fi

    docker run -d \\
      --name openclaw-gateway \\
      --restart=always \\
      $DOCKER_RUNTIME \\
      -p ${this.gatewayPort}:${this.gatewayPort} \\
      -v /mnt/openclaw/.openclaw:/home/node/.openclaw \\
      -e OPENCLAW_GATEWAY_PORT=${this.gatewayPort} \\
      -e OPENCLAW_GATEWAY_TOKEN="${gatewayToken}" \\
      ${imageUri} \\
      sh -c "npx -y openclaw@latest gateway --port ${this.gatewayPort} --verbose"

final_message: "OpenClaw gateway started on port ${this.gatewayPort}"
`;
  }

  private async getVmPrivateIp(): Promise<string | undefined> {
    try {
      const nic = await this.networkClient.networkInterfaces.get(
        this.config.resourceGroup,
        this.nicName
      );
      return nic.ipConfigurations?.[0]?.privateIPAddress ?? undefined;
    } catch {
      return undefined;
    }
  }

  // ------------------------------------------------------------------
  // configure
  // ------------------------------------------------------------------

  async configure(config: OpenClawConfigPayload): Promise<ConfigureResult> {
    const profileName = config.profileName;
    this.gatewayPort = config.gatewayPort;

    this.log(`Configuring Azure VM: ${profileName}`);

    if (!this.vmName) {
      this.deriveResourceNames(profileName);
    }

    // Apply config transformations (same as other deployment targets)
    const raw = { ...config.config } as Record<string, unknown>;

    // gateway.bind = "lan" - container MUST bind to 0.0.0.0
    if (raw.gateway && typeof raw.gateway === "object") {
      const gw = { ...(raw.gateway as Record<string, unknown>) };
      gw.bind = "lan";
      delete gw.host;
      delete gw.port;
      raw.gateway = gw;
    }

    // skills.allowUnverified is not a valid OpenClaw key
    if (raw.skills && typeof raw.skills === "object") {
      const skills = { ...(raw.skills as Record<string, unknown>) };
      delete skills.allowUnverified;
      raw.skills = skills;
    }

    // sandbox at root level -> agents.defaults.sandbox
    if ("sandbox" in raw) {
      const agents = (raw.agents as Record<string, unknown>) || {};
      const defaults = (agents.defaults as Record<string, unknown>) || {};
      defaults.sandbox = raw.sandbox;
      agents.defaults = defaults;
      raw.agents = agents;
      delete raw.sandbox;
    }

    // channels.*.enabled is not valid - presence means active
    if (raw.channels && typeof raw.channels === "object") {
      for (const [key, value] of Object.entries(raw.channels as Record<string, unknown>)) {
        if (value && typeof value === "object" && "enabled" in (value as Record<string, unknown>)) {
          const { enabled: _enabled, ...rest } = value as Record<string, unknown>;
          (raw.channels as Record<string, unknown>)[key] = rest;
        }
      }
    }

    const configData = JSON.stringify(raw, null, 2);

    try {
      // Store config in Key Vault if available
      if (this.keyVaultClient) {
        this.log(`Storing config in Key Vault: ${this.secretName}`);
        await this.ensureSecret(this.secretName, configData);
        this.log(`Key Vault secret updated`);
      }

      // For Azure VM, we need to use Run Command to update the config
      // This runs a script on the VM to write the config and restart the container
      // Use base64 encoding to safely pass JSON through shell without injection risk
      this.log(`Executing Run Command on VM: ${this.vmName}`);
      const base64Config = Buffer.from(configData).toString("base64");
      await this.computeClient.virtualMachines.beginRunCommandAndWait(
        this.config.resourceGroup,
        this.vmName,
        {
          commandId: "RunShellScript",
          script: [
            `echo '${base64Config}' | base64 -d > /mnt/openclaw/.openclaw/openclaw.json`,
            "docker restart openclaw-gateway 2>/dev/null || true",
          ],
        }
      );
      this.log(`Configuration applied and container restarted`);

      return {
        success: true,
        message: `Configuration applied to VM "${this.vmName}" and container restarted`,
        requiresRestart: false, // Already restarted via Run Command
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(`Configuration failed: ${errorMsg}`, "stderr");
      return {
        success: false,
        message: `Failed to configure: ${errorMsg}`,
        requiresRestart: false,
      };
    }
  }

  // ------------------------------------------------------------------
  // start
  // ------------------------------------------------------------------

  async start(): Promise<void> {
    this.log(`Starting VM: ${this.vmName}`);
    await this.computeClient.virtualMachines.beginStartAndWait(
      this.config.resourceGroup,
      this.vmName
    );
    this.log(`VM started`);
  }

  // ------------------------------------------------------------------
  // stop
  // ------------------------------------------------------------------

  async stop(): Promise<void> {
    this.log(`Deallocating VM: ${this.vmName}`);
    await this.computeClient.virtualMachines.beginDeallocateAndWait(
      this.config.resourceGroup,
      this.vmName
    );
    this.log(`VM deallocated`);
  }

  // ------------------------------------------------------------------
  // restart
  // ------------------------------------------------------------------

  async restart(): Promise<void> {
    this.log(`Restarting VM: ${this.vmName}`);
    await this.computeClient.virtualMachines.beginRestartAndWait(
      this.config.resourceGroup,
      this.vmName
    );
    this.log(`VM restarted`);
  }

  // ------------------------------------------------------------------
  // getStatus
  // ------------------------------------------------------------------

  async getStatus(): Promise<TargetStatus> {
    try {
      const instanceView = await this.computeClient.virtualMachines.instanceView(
        this.config.resourceGroup,
        this.vmName
      );

      const powerState = instanceView.statuses?.find(
        (s: { code?: string }) => s.code?.startsWith("PowerState/")
      );

      let state: TargetStatus["state"];
      let error: string | undefined;

      const code = powerState?.code ?? "";

      if (code === "PowerState/running") {
        state = "running";
      } else if (code === "PowerState/stopped" || code === "PowerState/deallocated") {
        state = "stopped";
      } else if (code === "PowerState/starting" || code === "PowerState/stopping") {
        state = "running"; // Transitional
      } else {
        state = "error";
        error = `Unknown VM power state: ${code}`;
      }

      return {
        state,
        gatewayPort: this.gatewayPort,
        error,
      };
    } catch (error: unknown) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        return { state: "not-installed" };
      }
      return {
        state: "error",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ------------------------------------------------------------------
  // getLogs
  // ------------------------------------------------------------------

  async getLogs(options?: DeploymentLogOptions): Promise<string[]> {
    // Try Log Analytics first if configured
    if (this.logsClient && this.config.logAnalyticsWorkspaceId) {
      return this.getLogsFromAnalytics(options);
    }

    // Fallback: use Run Command to get container logs
    try {
      const tailLines = options?.lines ?? 100;
      const result = await this.computeClient.virtualMachines.beginRunCommandAndWait(
        this.config.resourceGroup,
        this.vmName,
        {
          commandId: "RunShellScript",
          script: [`docker logs openclaw-gateway --tail ${tailLines} 2>&1`],
        }
      );

      const output = result.value?.[0]?.message ?? "";
      let lines = output.split("\n");

      if (options?.filter) {
        try {
          const pattern = new RegExp(options.filter, "i");
          lines = lines.filter((line: string) => pattern.test(line));
        } catch {
          const literal = options.filter.toLowerCase();
          lines = lines.filter((line: string) => line.toLowerCase().includes(literal));
        }
      }

      return lines;
    } catch {
      return [];
    }
  }

  private async getLogsFromAnalytics(options?: DeploymentLogOptions): Promise<string[]> {
    if (!this.logsClient || !this.config.logAnalyticsWorkspaceId) {
      return [];
    }

    const limit = options?.lines || 100;
    const query = `Syslog | where Computer == "${this.vmName}" | take ${limit} | project TimeGenerated, SyslogMessage`;

    try {
      const result = await this.logsClient.queryWorkspace(
        this.config.logAnalyticsWorkspaceId,
        query,
        { duration: "P1D" }
      );

      const lines: string[] = [];
      const tables = (result as { tables?: Array<{ rows?: unknown[][] }> }).tables;
      if (tables && tables[0]?.rows) {
        for (const row of tables[0].rows) {
          lines.push(row[1] as string);
        }
      }
      return lines;
    } catch {
      return [];
    }
  }

  // ------------------------------------------------------------------
  // getEndpoint
  // ------------------------------------------------------------------

  async getEndpoint(): Promise<GatewayEndpoint> {
    // CRITICAL: Return the Application Gateway's public endpoint, NEVER the VM's IP
    if (!this.appGatewayFqdn && !this.appGatewayPublicIp) {
      try {
        const pip = await this.networkClient.publicIPAddresses.get(
          this.config.resourceGroup,
          this.appGatewayPublicIpName
        );
        this.appGatewayPublicIp = pip.ipAddress || "";
        this.appGatewayFqdn = pip.dnsSettings?.fqdn || "";
      } catch {
        throw new Error("Application Gateway public IP not found");
      }
    }

    const host = this.appGatewayFqdn || this.appGatewayPublicIp;
    if (!host) {
      throw new Error("Application Gateway endpoint not available");
    }

    return {
      host: this.config.customDomain ?? host,
      port: 80, // Application Gateway frontend port
      protocol: "ws",
    };
  }

  // ------------------------------------------------------------------
  // destroy
  // ------------------------------------------------------------------

  async destroy(): Promise<void> {
    this.log(`Destroying Azure resources for: ${this.vmName}`);

    // 1. Delete VM
    this.log(`[1/8] Deleting VM: ${this.vmName}`);
    try {
      await this.computeClient.virtualMachines.beginDeleteAndWait(
        this.config.resourceGroup,
        this.vmName
      );
      this.log(`VM deleted`);
    } catch {
      this.log(`VM not found (skipped)`);
    }

    // 2. Delete NIC
    this.log(`[2/8] Deleting NIC: ${this.nicName}`);
    try {
      await this.networkClient.networkInterfaces.beginDeleteAndWait(
        this.config.resourceGroup,
        this.nicName
      );
      this.log(`NIC deleted`);
    } catch {
      this.log(`NIC not found (skipped)`);
    }

    // 3. Delete data disk
    this.log(`[3/8] Deleting data disk: ${this.dataDiskName}`);
    try {
      await this.computeClient.disks.beginDeleteAndWait(
        this.config.resourceGroup,
        this.dataDiskName
      );
      this.log(`Data disk deleted`);
    } catch {
      this.log(`Data disk not found (skipped)`);
    }

    // 4. Delete OS disk
    this.log(`[4/8] Deleting OS disk: ${this.vmName}-osdisk`);
    try {
      await this.computeClient.disks.beginDeleteAndWait(
        this.config.resourceGroup,
        `${this.vmName}-osdisk`
      );
      this.log(`OS disk deleted`);
    } catch {
      this.log(`OS disk not found (skipped)`);
    }

    // 5. Delete Key Vault secrets if configured
    if (this.keyVaultClient) {
      this.log(`[5/8] Deleting Key Vault secret: ${this.secretName}`);
      try {
        await this.keyVaultClient.beginDeleteSecret(this.secretName);
        this.log(`Key Vault secret deleted`);
      } catch {
        this.log(`Key Vault secret not found (skipped)`);
      }
    } else {
      this.log(`[5/8] Key Vault not configured (skipped)`);
    }

    // 6. Delete Application Gateway
    this.log(`[6/8] Deleting Application Gateway: ${this.appGatewayName}`);
    try {
      await this.networkClient.applicationGateways.beginDeleteAndWait(
        this.config.resourceGroup,
        this.appGatewayName
      );
      this.log(`Application Gateway deleted`);
    } catch {
      this.log(`Application Gateway not found (skipped)`);
    }

    // 7. Delete public IP
    this.log(`[7/8] Deleting public IP: ${this.appGatewayPublicIpName}`);
    try {
      await this.networkClient.publicIPAddresses.beginDeleteAndWait(
        this.config.resourceGroup,
        this.appGatewayPublicIpName
      );
      this.log(`Public IP deleted`);
    } catch {
      this.log(`Public IP not found (skipped)`);
    }

    // 8. Delete App Gateway subnet
    this.log(`[8/8] Deleting App Gateway subnet: ${this.appGatewaySubnetName}`);
    try {
      await this.networkClient.subnets.beginDeleteAndWait(
        this.config.resourceGroup,
        this.vnetName,
        this.appGatewaySubnetName
      );
      this.log(`App Gateway subnet deleted`);
    } catch {
      this.log(`App Gateway subnet not found (skipped)`);
    }

    this.log(`Azure resources destroyed (VNet/NSG preserved for reuse)`);
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  private async ensureSecret(name: string, value: string): Promise<void> {
    if (!this.keyVaultClient) return;

    try {
      await this.keyVaultClient.setSecret(name, value);
    } catch {
      // Secret storage failures are non-fatal - the config may still work
    }
  }

  // ------------------------------------------------------------------
  // updateResources
  // ------------------------------------------------------------------

  async updateResources(spec: ResourceSpec): Promise<ResourceUpdateResult> {
    this.log(`Starting resource update for VM: ${this.vmName}`);

    try {
      // Azure VM resource updates require:
      // 1. Deallocate the VM (fully release compute resources)
      // 2. Change VM size
      // 3. Optionally resize data disk (only if larger)
      // 4. Start the VM

      // Validate disk size - cloud providers don't support shrinking disks
      if (spec.dataDiskSizeGb && spec.dataDiskSizeGb < this.dataDiskSizeGb) {
        this.log(`Disk shrink not supported: ${this.dataDiskSizeGb}GB -> ${spec.dataDiskSizeGb}GB`, "stderr");
        return {
          success: false,
          message: `Disk cannot be shrunk. Current size: ${this.dataDiskSizeGb}GB, requested: ${spec.dataDiskSizeGb}GB. Cloud providers only support expanding disks.`,
          requiresRestart: false,
        };
      }

      // Determine target VM size from spec
      const targetVmSize = this.specToVmSize(spec);
      this.log(`Target VM size: ${targetVmSize}`);

      // 1. Deallocate VM
      this.log(`[1/4] Deallocating VM: ${this.vmName}`);
      await this.computeClient.virtualMachines.beginDeallocateAndWait(
        this.config.resourceGroup,
        this.vmName
      );
      this.log(`VM deallocated`);

      // 2. Change VM size
      this.log(`[2/4] Changing VM size to: ${targetVmSize}`);
      await this.computeClient.virtualMachines.beginUpdateAndWait(
        this.config.resourceGroup,
        this.vmName,
        {
          hardwareProfile: {
            vmSize: targetVmSize,
          },
        }
      );
      this.log(`VM size changed`);

      // 3. Resize data disk if requested and larger than current
      if (spec.dataDiskSizeGb && spec.dataDiskSizeGb > this.dataDiskSizeGb) {
        this.log(`[3/4] Resizing data disk: ${this.dataDiskSizeGb}GB -> ${spec.dataDiskSizeGb}GB`);
        await this.computeClient.disks.beginUpdateAndWait(
          this.config.resourceGroup,
          this.dataDiskName,
          {
            diskSizeGB: spec.dataDiskSizeGb,
          }
        );
        this.log(`Disk resized to ${spec.dataDiskSizeGb}GB`);
      } else {
        this.log(`[3/4] Disk resize skipped (no change needed)`);
      }

      // 4. Start VM
      this.log(`[4/4] Starting VM`);
      await this.computeClient.virtualMachines.beginStartAndWait(
        this.config.resourceGroup,
        this.vmName
      );
      this.log(`VM started`);

      this.log(`Resource update complete!`);

      return {
        success: true,
        message: `Azure VM resources updated to ${targetVmSize}${spec.dataDiskSizeGb ? `, ${spec.dataDiskSizeGb}GB disk` : ""}`,
        requiresRestart: true,
        estimatedDowntime: 90,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(`Resource update failed: ${errorMsg}`, "stderr");

      // Try to start VM again if we deallocated it
      this.log(`Attempting to recover by starting VM...`);
      try {
        await this.computeClient.virtualMachines.beginStartAndWait(
          this.config.resourceGroup,
          this.vmName
        );
        this.log(`VM recovery started`);
      } catch {
        this.log(`VM recovery failed - manual intervention may be required`, "stderr");
      }

      return {
        success: false,
        message: `Failed to update resources: ${errorMsg}`,
        requiresRestart: false,
      };
    }
  }

  // ------------------------------------------------------------------
  // getResources
  // ------------------------------------------------------------------

  async getResources(): Promise<ResourceSpec> {
    // Get current VM to read size
    const vm = await this.computeClient.virtualMachines.get(
      this.config.resourceGroup,
      this.vmName
    );

    const vmSize = vm.hardwareProfile?.vmSize ?? this.vmSize;

    // Get disk size
    const disk = await this.computeClient.disks.get(
      this.config.resourceGroup,
      this.dataDiskName
    );

    const diskSizeGb = disk.diskSizeGB ?? this.dataDiskSizeGb;

    // Convert VM size to ResourceSpec
    return this.vmSizeToSpec(vmSize, diskSizeGb);
  }

  // ------------------------------------------------------------------
  // Resource spec conversion helpers
  // ------------------------------------------------------------------

  private specToVmSize(spec: ResourceSpec): string {
    // Find matching tier or use custom VM size logic
    for (const [, tierSpec] of Object.entries(AZURE_TIER_SPECS)) {
      if (spec.cpu === tierSpec.cpu && spec.memory === tierSpec.memory) {
        return tierSpec.vmSize ?? "Standard_B2s";
      }
    }

    // For custom specs, map to closest Azure VM size
    // Azure B-series: Standard_B1s (1 vCPU, 1GB), Standard_B2s (2 vCPU, 4GB)
    // Azure D-series: Standard_D2s_v3 (2 vCPU, 8GB)
    if (spec.memory >= 4096) {
      return "Standard_D2s_v3";
    } else if (spec.cpu >= 2048 || spec.memory >= 2048) {
      return "Standard_B2s";
    }
    return "Standard_B1s";
  }

  private vmSizeToSpec(vmSize: string, dataDiskSizeGb: number): ResourceSpec {
    // Map Azure VM sizes to ResourceSpec
    switch (vmSize) {
      case "Standard_B1s":
        return { cpu: 1024, memory: 1024, dataDiskSizeGb };
      case "Standard_B2s":
        return { cpu: 2048, memory: 2048, dataDiskSizeGb };
      case "Standard_D2s_v3":
        return { cpu: 2048, memory: 4096, dataDiskSizeGb };
      default:
        // For unknown sizes, return default
        return { cpu: 1024, memory: 2048, dataDiskSizeGb };
    }
  }
}
