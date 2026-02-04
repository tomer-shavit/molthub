/**
 * Azure VM Deployment Target
 *
 * Manages an OpenClaw gateway instance running on Azure Virtual Machine.
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

import { ComputeManagementClient } from "@azure/arm-compute";
import { NetworkManagementClient } from "@azure/arm-network";
import { DefaultAzureCredential, ClientSecretCredential, TokenCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { LogsQueryClient } from "@azure/monitor-query";

import { BaseDeploymentTarget } from "../../base/base-deployment-target";
import type { TransformOptions } from "../../base/config-transformer";
import { buildCloudInitScript } from "../../base/startup-script-builder";
import {
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
import type { VmStatus } from "./types";
import type {
  IAzureNetworkManager,
  IAzureComputeManager,
  IAzureAppGatewayManager,
} from "./managers";
import { AzureNetworkManager } from "./managers"; // Needed for static method
import { AzureManagerFactory, AzureManagers } from "./azure-manager-factory";

const DEFAULT_VM_SIZE = "Standard_B2s";
const DEFAULT_OS_DISK_SIZE_GB = 30;
const DEFAULT_DATA_DISK_SIZE_GB = 10;
const DEFAULT_VNET_PREFIX = "10.0.0.0/16";
const DEFAULT_VM_SUBNET_PREFIX = "10.0.1.0/24";
const DEFAULT_APPGW_SUBNET_PREFIX = "10.0.2.0/24";

/**
 * Options for constructing an AzureVmTarget with dependency injection support.
 */
export interface AzureVmTargetOptions {
  /** Azure VM configuration */
  config: AzureVmConfig;
  /** Optional managers for dependency injection (useful for testing) */
  managers?: AzureManagers;
}

export class AzureVmTarget extends BaseDeploymentTarget {
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

  // Managers (using interfaces for dependency inversion)
  private readonly networkManager: IAzureNetworkManager;
  private readonly computeManager: IAzureComputeManager;
  private readonly appGatewayManager: IAzureAppGatewayManager;

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

  /**
   * Create an AzureVmTarget with just a config (backward compatible).
   * @param config - Azure VM configuration
   */
  constructor(config: AzureVmConfig);
  /**
   * Create an AzureVmTarget with options including optional managers for DI.
   * @param options - Options including config and optional managers
   */
  constructor(options: AzureVmTargetOptions);
  constructor(configOrOptions: AzureVmConfig | AzureVmTargetOptions) {
    super();

    // Determine if we received options or just config (backward compatibility)
    const isOptions = (arg: AzureVmConfig | AzureVmTargetOptions): arg is AzureVmTargetOptions =>
      "config" in arg && typeof (arg as AzureVmTargetOptions).config === "object";

    const config = isOptions(configOrOptions) ? configOrOptions.config : configOrOptions;
    const providedManagers = isOptions(configOrOptions) ? configOrOptions.managers : undefined;

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

    // Use provided managers (for testing) or create via factory (production)
    if (providedManagers) {
      // Dependency injection path - use provided managers
      this.networkManager = providedManagers.networkManager;
      this.computeManager = providedManagers.computeManager;
      this.appGatewayManager = providedManagers.appGatewayManager;
    } else {
      // Factory path - create managers with proper wiring
      const boundLog = (msg: string, stream: "stdout" | "stderr" = "stdout") => this.log(msg, stream);
      const managers = AzureManagerFactory.createManagers({
        subscriptionId: config.subscriptionId,
        resourceGroup: config.resourceGroup,
        location: config.region,
        credentials: this.credential,
        log: boundLog,
      });

      this.networkManager = managers.networkManager;
      this.computeManager = managers.computeManager;
      this.appGatewayManager = managers.appGatewayManager;
    }

    // Derive resource names from profileName if available
    if (config.profileName) {
      this.deriveResourceNames(config.profileName);
    }
  }

  // ------------------------------------------------------------------
  // Config transformation options
  // ------------------------------------------------------------------

  protected getTransformOptions(): TransformOptions {
    return {
      // Add custom transform to set gateway.bind = "lan"
      customTransforms: [
        (config) => {
          const result = { ...config };
          if (result.gateway && typeof result.gateway === "object") {
            const gw = { ...(result.gateway as Record<string, unknown>) };
            gw.bind = "lan";
            delete gw.host;
            delete gw.port;
            result.gateway = gw;
          }
          return result;
        },
      ],
    };
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
      await this.computeManager.createDataDisk(this.dataDiskName, this.dataDiskSizeGb);
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
      const vmPrivateIp = await this.computeManager.getVmPrivateIp(this.nicName);
      if (vmPrivateIp) {
        await this.appGatewayManager.updateBackendPool(this.appGatewayName, vmPrivateIp);
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
    const vnetAddressPrefix = this.config.vnetAddressPrefix ?? DEFAULT_VNET_PREFIX;
    const subnetAddressPrefix = this.config.subnetAddressPrefix ?? DEFAULT_VM_SUBNET_PREFIX;

    // 1. Create or get VNet
    this.log(`  Creating/verifying VNet: ${this.vnetName}`);
    await this.networkManager.ensureVNet(this.vnetName, vnetAddressPrefix);

    // 2. Create or get NSG with secure rules
    this.log(`  Creating/verifying NSG: ${this.nsgName}`);
    const defaultRules = AzureNetworkManager.getDefaultSecurityRules();
    const nsg = await this.networkManager.ensureNSG(
      this.nsgName,
      defaultRules,
      this.config.additionalNsgRules
    );

    // 3. Create or get subnet for VM
    this.log(`  Creating/verifying subnet: ${this.subnetName}`);
    await this.networkManager.ensureVmSubnet(
      this.vnetName,
      this.subnetName,
      subnetAddressPrefix,
      nsg.id!
    );
  }

  // ------------------------------------------------------------------
  // Application Gateway
  // ------------------------------------------------------------------

  private async ensureApplicationGateway(): Promise<void> {
    const appGwSubnetAddressPrefix = this.config.appGatewaySubnetAddressPrefix ?? DEFAULT_APPGW_SUBNET_PREFIX;

    this.log(`  Creating/verifying App Gateway subnet: ${this.appGatewaySubnetName}`);
    const subnet = await this.networkManager.ensureAppGatewaySubnet(
      this.vnetName,
      this.appGatewaySubnetName,
      appGwSubnetAddressPrefix
    );

    this.log(`  Creating/verifying App Gateway public IP: ${this.appGatewayPublicIpName}`);
    const pipResult = await this.appGatewayManager.ensurePublicIp(
      this.appGatewayPublicIpName,
      this.appGatewayName
    );
    this.appGatewayPublicIp = pipResult.ipAddress;
    this.appGatewayFqdn = pipResult.fqdn;

    this.log(`  Creating/verifying Application Gateway: ${this.appGatewayName}`);
    await this.appGatewayManager.ensureAppGateway(
      this.appGatewayName,
      subnet.id!,
      this.appGatewayPublicIpName,
      this.gatewayPort
    );
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

    // Create NIC
    const nic = await this.computeManager.createNic(this.nicName, subnet.id!);

    // Get data disk
    const dataDisk = await this.computeClient.disks.get(
      this.config.resourceGroup,
      this.dataDiskName
    );

    // Build cloud-init script using the shared builder
    const cloudInit = buildCloudInitScript({
      platform: "azure",
      dataMount: "/mnt/openclaw",
      gatewayPort: this.gatewayPort,
      gatewayToken: options.gatewayAuthToken,
      configSource: "env",
      imageUri,
      additionalEnv: options.containerEnv,
    });

    // Create VM
    await this.computeManager.createVm(
      this.vmName,
      nic.id!,
      dataDisk.id!,
      this.vmSize,
      this.osDiskSizeGb,
      cloudInit,
      this.config.sshPublicKey,
      { profile: this.sanitizeName(options.profileName) }
    );
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

    // Transform config using the base class method
    const raw = this.transformConfig({ ...config.config });
    const configData = JSON.stringify(raw, null, 2);

    try {
      // Store config in Key Vault if available
      if (this.keyVaultClient) {
        this.log(`Storing config in Key Vault: ${this.secretName}`);
        await this.ensureSecret(this.secretName, configData);
        this.log(`Key Vault secret updated`);
      }

      // Use Run Command to update the config on the VM
      // Use base64 encoding to safely pass JSON through shell without injection risk
      this.log(`Executing Run Command on VM: ${this.vmName}`);
      const base64Config = Buffer.from(configData).toString("base64");
      await this.computeManager.runCommand(this.vmName, [
        `echo '${base64Config}' | base64 -d > /mnt/openclaw/.openclaw/openclaw.json`,
        "docker restart openclaw-gateway 2>/dev/null || true",
      ]);
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
    await this.computeManager.startVm(this.vmName);
  }

  // ------------------------------------------------------------------
  // stop
  // ------------------------------------------------------------------

  async stop(): Promise<void> {
    await this.computeManager.stopVm(this.vmName);
  }

  // ------------------------------------------------------------------
  // restart
  // ------------------------------------------------------------------

  async restart(): Promise<void> {
    await this.computeManager.restartVm(this.vmName);
  }

  // ------------------------------------------------------------------
  // getStatus
  // ------------------------------------------------------------------

  async getStatus(): Promise<TargetStatus> {
    try {
      const vmStatus: VmStatus = await this.computeManager.getVmStatus(this.vmName);

      let state: TargetStatus["state"];
      let error: string | undefined;

      if (vmStatus === "running") {
        state = "running";
      } else if (vmStatus === "stopped" || vmStatus === "deallocated") {
        state = "stopped";
      } else if (vmStatus === "starting" || vmStatus === "stopping") {
        state = "running"; // Transitional
      } else {
        state = "error";
        error = `Unknown VM power state: ${vmStatus}`;
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
      const output = await this.computeManager.runCommand(this.vmName, [
        `docker logs openclaw-gateway --tail ${tailLines} 2>&1`,
      ]);

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
        const endpoint = await this.appGatewayManager.getGatewayEndpoint(this.appGatewayPublicIpName);
        this.appGatewayPublicIp = endpoint.publicIp;
        this.appGatewayFqdn = endpoint.fqdn;
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
    await this.computeManager.deleteVm(this.vmName);

    // 2. Delete NIC
    this.log(`[2/8] Deleting NIC: ${this.nicName}`);
    await this.computeManager.deleteNic(this.nicName);

    // 3. Delete data disk
    this.log(`[3/8] Deleting data disk: ${this.dataDiskName}`);
    await this.computeManager.deleteDisk(this.dataDiskName);

    // 4. Delete OS disk
    this.log(`[4/8] Deleting OS disk: ${this.vmName}-osdisk`);
    await this.computeManager.deleteDisk(`${this.vmName}-osdisk`);

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
    await this.appGatewayManager.deleteAppGateway(this.appGatewayName);

    // 7. Delete public IP
    this.log(`[7/8] Deleting public IP: ${this.appGatewayPublicIpName}`);
    await this.appGatewayManager.deletePublicIp(this.appGatewayPublicIpName);

    // 8. Delete App Gateway subnet
    this.log(`[8/8] Deleting App Gateway subnet: ${this.appGatewaySubnetName}`);
    await this.appGatewayManager.deleteSubnet(this.vnetName, this.appGatewaySubnetName);

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
      await this.computeManager.stopVm(this.vmName);
      this.log(`VM deallocated`);

      // 2. Change VM size
      this.log(`[2/4] Changing VM size to: ${targetVmSize}`);
      await this.computeManager.resizeVm(this.vmName, targetVmSize);
      this.log(`VM size changed`);

      // 3. Resize data disk if requested and larger than current
      if (spec.dataDiskSizeGb && spec.dataDiskSizeGb > this.dataDiskSizeGb) {
        this.log(`[3/4] Resizing data disk: ${this.dataDiskSizeGb}GB -> ${spec.dataDiskSizeGb}GB`);
        await this.computeManager.resizeDisk(this.dataDiskName, spec.dataDiskSizeGb);
        this.log(`Disk resized to ${spec.dataDiskSizeGb}GB`);
      } else {
        this.log(`[3/4] Disk resize skipped (no change needed)`);
      }

      // 4. Start VM
      this.log(`[4/4] Starting VM`);
      await this.computeManager.startVm(this.vmName);
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
        await this.computeManager.startVm(this.vmName);
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
