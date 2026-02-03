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

    try {
      // 1. Set up VNet infrastructure
      await this.ensureNetworkInfrastructure();

      // 2. Set up Application Gateway for secure external access
      await this.ensureApplicationGateway();

      // 3. Create data disk for persistent storage
      await this.ensureDataDisk();

      // 4. Store initial empty config in Key Vault if available
      if (this.keyVaultClient) {
        await this.ensureSecret(this.secretName, "{}");
      }

      // 5. Create VM with Docker and startup script
      await this.createVm(options);

      // 6. Update Application Gateway backend with VM's private IP
      const vmPrivateIp = await this.getVmPrivateIp();
      if (vmPrivateIp) {
        await this.updateAppGatewayBackend(vmPrivateIp);
      }

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
      return {
        success: false,
        instanceId: this.vmName,
        message: `Azure VM install failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // ------------------------------------------------------------------
  // Network Infrastructure
  // ------------------------------------------------------------------

  private async ensureNetworkInfrastructure(): Promise<void> {
    // 1. Create or get VNet
    await this.ensureVNet();

    // 2. Create or get NSG with secure rules
    await this.ensureNSG();

    // 3. Create or get subnet for VM
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
    await this.ensureAppGatewaySubnet();
    await this.ensureAppGatewayPublicIp();
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
    } catch (error) {
      console.warn(`Failed to update Application Gateway backend: ${error}`);
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

  # Write initial config
  - echo '{}' > /mnt/openclaw/.openclaw/openclaw.json

  # Stop any existing container
  - docker rm -f openclaw-gateway 2>/dev/null || true

  # Run OpenClaw in Docker with full Docker access (for sandbox)
  - |
    docker run -d \\
      --name openclaw-gateway \\
      --restart=always \\
      -p ${this.gatewayPort}:${this.gatewayPort} \\
      -v /mnt/openclaw/.openclaw:/home/node/.openclaw \\
      -v /var/run/docker.sock:/var/run/docker.sock \\
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
        await this.ensureSecret(this.secretName, configData);
      }

      // For Azure VM, we need to use Run Command to update the config
      // This runs a script on the VM to write the config and restart the container
      // Use base64 encoding to safely pass JSON through shell without injection risk
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

      return {
        success: true,
        message: `Configuration applied to VM "${this.vmName}" and container restarted`,
        requiresRestart: false, // Already restarted via Run Command
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to configure: ${error instanceof Error ? error.message : String(error)}`,
        requiresRestart: false,
      };
    }
  }

  // ------------------------------------------------------------------
  // start
  // ------------------------------------------------------------------

  async start(): Promise<void> {
    await this.computeClient.virtualMachines.beginStartAndWait(
      this.config.resourceGroup,
      this.vmName
    );
  }

  // ------------------------------------------------------------------
  // stop
  // ------------------------------------------------------------------

  async stop(): Promise<void> {
    await this.computeClient.virtualMachines.beginDeallocateAndWait(
      this.config.resourceGroup,
      this.vmName
    );
  }

  // ------------------------------------------------------------------
  // restart
  // ------------------------------------------------------------------

  async restart(): Promise<void> {
    await this.computeClient.virtualMachines.beginRestartAndWait(
      this.config.resourceGroup,
      this.vmName
    );
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
    // 1. Delete VM
    try {
      await this.computeClient.virtualMachines.beginDeleteAndWait(
        this.config.resourceGroup,
        this.vmName
      );
    } catch {
      // VM may not exist
    }

    // 2. Delete NIC
    try {
      await this.networkClient.networkInterfaces.beginDeleteAndWait(
        this.config.resourceGroup,
        this.nicName
      );
    } catch {
      // NIC may not exist
    }

    // 3. Delete data disk
    try {
      await this.computeClient.disks.beginDeleteAndWait(
        this.config.resourceGroup,
        this.dataDiskName
      );
    } catch {
      // Disk may not exist
    }

    // 4. Delete OS disk
    try {
      await this.computeClient.disks.beginDeleteAndWait(
        this.config.resourceGroup,
        `${this.vmName}-osdisk`
      );
    } catch {
      // OS disk may not exist
    }

    // 5. Delete Key Vault secrets if configured
    if (this.keyVaultClient) {
      try {
        await this.keyVaultClient.beginDeleteSecret(this.secretName);
      } catch {
        // Secret may not exist
      }
    }

    // 6. Delete Application Gateway
    try {
      await this.networkClient.applicationGateways.beginDeleteAndWait(
        this.config.resourceGroup,
        this.appGatewayName
      );
    } catch {
      // App Gateway may not exist
    }

    // 7. Delete public IP
    try {
      await this.networkClient.publicIPAddresses.beginDeleteAndWait(
        this.config.resourceGroup,
        this.appGatewayPublicIpName
      );
    } catch {
      // Public IP may not exist
    }

    // 8. Delete App Gateway subnet
    try {
      await this.networkClient.subnets.beginDeleteAndWait(
        this.config.resourceGroup,
        this.vnetName,
        this.appGatewaySubnetName
      );
    } catch {
      // Subnet may not exist
    }

    // Note: VNet, VM subnet, and NSG are NOT deleted to allow reuse
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  private async ensureSecret(name: string, value: string): Promise<void> {
    if (!this.keyVaultClient) return;

    try {
      await this.keyVaultClient.setSecret(name, value);
    } catch (error) {
      console.warn(`Failed to store secret in Key Vault: ${error}`);
    }
  }
}
