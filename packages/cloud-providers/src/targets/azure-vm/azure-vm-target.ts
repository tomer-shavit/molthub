/**
 * Azure VM Deployment Target
 *
 * Manages an OpenClaw gateway instance running on Azure Virtual Machine.
 *
 * ARCHITECTURE:
 *   Internet → NSG (80/443) → VM (static public IP) → Caddy → 127.0.0.1:port → OpenClaw container
 *
 * Storage: Azure Files (CIFS mount via Managed Identity)
 * Config: Key Vault (fetched via MI during cloud-init)
 * Sandbox: Sysbox runtime (installed via .deb)
 */

import { ComputeManagementClient } from "@azure/arm-compute";
import { NetworkManagementClient } from "@azure/arm-network";
import { DefaultAzureCredential, ClientSecretCredential, TokenCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { LogsQueryClient } from "@azure/monitor-query";

import { BaseDeploymentTarget } from "../../base/base-deployment-target";
import type { TransformOptions } from "../../base/config-transformer";
import { buildAzureCaddyCloudInit } from "../../base/startup-script-builder";
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
import type { ResourceSpec, ResourceUpdateResult, ResourceTier, TierSpec } from "../../interface/resource-spec";
import type { AdapterMetadata, SelfDescribingDeploymentTarget } from "../../interface/adapter-metadata";
import type { AzureVmConfig } from "./azure-vm-config";
import type { VmStatus } from "./types";
import type {
  IAzureNetworkManager,
  IAzureComputeManager,
  IAzureSharedInfraManager,
} from "./managers";
import { AzureNetworkManager, deriveSharedInfraNames } from "./managers";
import { AzureManagerFactory, AzureManagers } from "./azure-manager-factory";

// ── Tier Specs ──────────────────────────────────────────────────────────

const AZURE_TIER_SPECS: Record<Exclude<ResourceTier, "custom">, TierSpec> = {
  light: {
    tier: "light",
    cpu: 1024,
    memory: 2048,
    dataDiskSizeGb: 0,
    vmSize: "Standard_B1ms",
  },
  standard: {
    tier: "standard",
    cpu: 2048,
    memory: 4096,
    dataDiskSizeGb: 0,
    vmSize: "Standard_B2s",
  },
  performance: {
    tier: "performance",
    cpu: 2048,
    memory: 8192,
    dataDiskSizeGb: 0,
    vmSize: "Standard_D2s_v3",
  },
};

// ── Defaults ────────────────────────────────────────────────────────────

const DEFAULT_VM_SIZE = "Standard_B2s";
const DEFAULT_OS_DISK_SIZE_GB = 30;
const DEFAULT_VNET_PREFIX = "10.0.0.0/16";
const DEFAULT_VM_SUBNET_PREFIX = "10.0.1.0/24";
const DEFAULT_SHARE_NAME = "clawster-data";
const DEFAULT_MOUNT_PATH = "/mnt/openclaw";

// ── Shared Infra Result ─────────────────────────────────────────────────

interface SharedInfraResult {
  storageAccountName: string;
  shareName: string;
  managedIdentityId: string;
  managedIdentityClientId: string;
  keyVaultName?: string;
  keyVaultUri?: string;
}

// ── Target Options ──────────────────────────────────────────────────────

export interface AzureVmTargetOptions {
  config: AzureVmConfig;
  managers?: AzureManagers;
}

// ── Target Class ────────────────────────────────────────────────────────

export class AzureVmTarget extends BaseDeploymentTarget implements SelfDescribingDeploymentTarget {
  readonly type = DeploymentTargetType.AZURE_VM;

  private readonly config: AzureVmConfig;
  private readonly vmSize: string;
  private readonly osDiskSizeGb: number;
  private readonly credential: TokenCredential;

  private readonly computeClient: ComputeManagementClient;
  private readonly networkClient: NetworkManagementClient;
  private readonly keyVaultClient?: SecretClient;
  private readonly logsClient?: LogsQueryClient;

  private readonly networkManager: IAzureNetworkManager;
  private readonly computeManager: IAzureComputeManager;
  private readonly sharedInfraManager: IAzureSharedInfraManager;

  /** Derived resource names */
  private vmName = "";
  private nicName = "";
  private publicIpName = "";
  private vnetName = "";
  private subnetName = "";
  private nsgName = "";
  private secretName = "";
  private gatewayPort = 18789;

  /** Cached public IP */
  private cachedPublicIp = "";

  constructor(config: AzureVmConfig);
  constructor(options: AzureVmTargetOptions);
  constructor(configOrOptions: AzureVmConfig | AzureVmTargetOptions) {
    super();

    const isOptions = (arg: AzureVmConfig | AzureVmTargetOptions): arg is AzureVmTargetOptions =>
      "config" in arg && typeof (arg as AzureVmTargetOptions).config === "object";

    const config = isOptions(configOrOptions) ? configOrOptions.config : configOrOptions;
    const providedManagers = isOptions(configOrOptions) ? configOrOptions.managers : undefined;

    this.config = config;
    this.vmSize = config.vmSize ?? DEFAULT_VM_SIZE;
    this.osDiskSizeGb = config.osDiskSizeGb ?? DEFAULT_OS_DISK_SIZE_GB;

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

    this.computeClient = new ComputeManagementClient(this.credential, config.subscriptionId);
    this.networkClient = new NetworkManagementClient(this.credential, config.subscriptionId);

    if (config.keyVaultName) {
      this.keyVaultClient = new SecretClient(
        `https://${config.keyVaultName}.vault.azure.net`,
        this.credential
      );
    }

    if (config.logAnalyticsWorkspaceId) {
      this.logsClient = new LogsQueryClient(this.credential);
    }

    if (providedManagers) {
      this.networkManager = providedManagers.networkManager;
      this.computeManager = providedManagers.computeManager;
      this.sharedInfraManager = providedManagers.sharedInfraManager;
    } else {
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
      this.sharedInfraManager = managers.sharedInfraManager;
    }

    if (config.profileName) {
      this.deriveResourceNames(config.profileName);
    }
  }

  // ── Config transformation ───────────────────────────────────────────

  protected getTransformOptions(): TransformOptions {
    return {
      customTransforms: [
        (config) => {
          const result = { ...config };
          if (result.gateway && typeof result.gateway === "object") {
            const gw = { ...(result.gateway as Record<string, unknown>) };
            gw.bind = "lan"; // 0.0.0.0 inside container — Docker maps to host localhost
            delete gw.host;
            delete gw.port;
            result.gateway = gw;
          }
          return result;
        },
      ],
    };
  }

  // ── Resource name helpers ───────────────────────────────────────────

  private deriveResourceNames(profileName: string): void {
    const sanitized = this.sanitizeName(profileName);
    this.vmName = `clawster-${sanitized}`;
    this.nicName = `clawster-nic-${sanitized}`;
    this.publicIpName = `clawster-pip-${sanitized}`;
    this.vnetName = this.config.vnetName ?? "clawster-vnet";
    this.subnetName = this.config.subnetName ?? "clawster-vm-subnet";
    this.nsgName = this.config.nsgName ?? "clawster-nsg";
    this.secretName = `clawster-${sanitized}-config`;
  }

  // ── install ─────────────────────────────────────────────────────────

  async install(options: InstallOptions): Promise<InstallResult> {
    const profileName = this.sanitizeName(options.profileName);
    this.gatewayPort = options.port;
    this.deriveResourceNames(profileName);

    this.log(`Starting Azure VM installation for ${profileName}`);
    this.log(`Region: ${this.config.region}, VM Size: ${this.vmSize}`);

    try {
      // 1. Network infrastructure (shared, idempotent)
      this.log(`[1/7] Setting up network infrastructure...`);
      await this.ensureNetworkInfrastructure();
      this.log(`Network infrastructure ready`);

      // 2. Shared infrastructure (Storage, MI, Key Vault, RBAC)
      this.log(`[2/7] Provisioning shared infrastructure...`);
      const sharedInfra = await this.ensureSharedInfrastructure();
      this.log(`Shared infrastructure ready`);

      // 3. Store config in Key Vault
      if (this.keyVaultClient || sharedInfra.keyVaultUri) {
        this.log(`[3/7] Storing config in Key Vault: ${this.secretName}`);
        const kvClient = this.keyVaultClient ?? new SecretClient(
          sharedInfra.keyVaultUri!,
          this.credential
        );
        try {
          await kvClient.setSecret(this.secretName, "{}");
        } catch {
          // Secret storage failures are non-fatal
        }
        this.log(`Key Vault secret created`);
      } else {
        this.log(`[3/7] Key Vault not configured (skipped)`);
      }

      // 4. Create static public IP
      this.log(`[4/7] Creating static public IP: ${this.publicIpName}`);
      const pip = await this.networkManager.ensurePublicIp(this.publicIpName);
      this.cachedPublicIp = pip.ipAddress ?? "";
      this.log(`Public IP ready: ${this.cachedPublicIp}`);

      // 5. Create NIC (with public IP, in subnet with NSG)
      this.log(`[5/7] Creating NIC: ${this.nicName}`);
      const subnet = await this.networkClient.subnets.get(
        this.config.resourceGroup,
        this.vnetName,
        this.subnetName
      );
      const nic = await this.computeManager.createNic(this.nicName, subnet.id!, pip.id!);
      this.log(`NIC ready`);

      // 6. Create VM with Caddy cloud-init (attaches MI)
      this.log(`[6/7] Creating VM: ${this.vmName}`);
      await this.createVm(options, nic.id!, sharedInfra);
      this.log(`VM created — cloud-init will install Docker, Sysbox, Caddy, and start OpenClaw`);

      // 7. Done
      this.log(`[7/7] Verifying deployment...`);

      this.log(`Azure VM installation complete!`);

      return {
        success: true,
        instanceId: this.vmName,
        message: `Azure VM "${this.vmName}" created (Caddy + public IP) in ${this.config.region}. Endpoint: http://${this.cachedPublicIp}`,
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

  // ── Network infrastructure ──────────────────────────────────────────

  private async ensureNetworkInfrastructure(): Promise<void> {
    const vnetAddressPrefix = this.config.vnetAddressPrefix ?? DEFAULT_VNET_PREFIX;
    const subnetAddressPrefix = this.config.subnetAddressPrefix ?? DEFAULT_VM_SUBNET_PREFIX;

    this.log(`  Creating/verifying VNet: ${this.vnetName}`);
    await this.networkManager.ensureVNet(this.vnetName, vnetAddressPrefix);

    this.log(`  Creating/verifying NSG: ${this.nsgName}`);
    const defaultRules = AzureNetworkManager.getDefaultSecurityRules();
    const nsg = await this.networkManager.ensureNSG(
      this.nsgName,
      defaultRules,
      this.config.additionalNsgRules
    );

    this.log(`  Creating/verifying subnet: ${this.subnetName}`);
    await this.networkManager.ensureVmSubnet(
      this.vnetName,
      this.subnetName,
      subnetAddressPrefix,
      nsg.id!
    );
  }

  // ── Shared infrastructure ──────────────────────────────────────────

  private async ensureSharedInfrastructure(): Promise<SharedInfraResult> {
    const names = deriveSharedInfraNames(
      this.config.subscriptionId,
      this.config.resourceGroup
    );
    const storageAccountName = this.config.storageAccountName ?? names.storageAccountName;
    const shareName = this.config.shareName ?? DEFAULT_SHARE_NAME;
    const keyVaultName = this.config.keyVaultName ?? names.keyVaultName;
    const miName = names.managedIdentityName;

    // 1. Storage Account + File Share
    const storageAccount = await this.sharedInfraManager.ensureStorageAccount(storageAccountName);
    await this.sharedInfraManager.ensureFileShare(storageAccountName, shareName);

    // 2. Managed Identity
    const mi = await this.sharedInfraManager.ensureManagedIdentity(miName);

    // 3. Key Vault (requires tenantId)
    const tenantId = this.config.tenantId ?? "";
    let keyVaultInfo: { id: string; name: string; uri: string } | undefined;
    if (tenantId) {
      keyVaultInfo = await this.sharedInfraManager.ensureKeyVault(keyVaultName, tenantId);
    }

    // 4. RBAC role assignments
    if (keyVaultInfo && storageAccount.id && keyVaultInfo.id) {
      await this.sharedInfraManager.assignRoles(
        mi.principalId,
        storageAccount.id,
        keyVaultInfo.id
      );
    }

    return {
      storageAccountName,
      shareName,
      managedIdentityId: mi.id,
      managedIdentityClientId: mi.clientId,
      keyVaultName: keyVaultInfo?.name,
      keyVaultUri: keyVaultInfo?.uri,
    };
  }

  // ── VM Creation ─────────────────────────────────────────────────────

  private async createVm(
    options: InstallOptions,
    nicId: string,
    sharedInfra: SharedInfraResult
  ): Promise<void> {
    const cloudInit = buildAzureCaddyCloudInit({
      gatewayPort: this.gatewayPort,
      caddyDomain: this.config.customDomain,
      azureFiles: {
        storageAccountName: sharedInfra.storageAccountName,
        shareName: sharedInfra.shareName,
        mountPath: DEFAULT_MOUNT_PATH,
        managedIdentityClientId: sharedInfra.managedIdentityClientId,
      },
      keyVault: sharedInfra.keyVaultName
        ? {
            vaultName: sharedInfra.keyVaultName,
            secretName: this.secretName,
            managedIdentityClientId: sharedInfra.managedIdentityClientId,
          }
        : undefined,
      additionalEnv: options.containerEnv,
      middlewareConfig: options.middlewareConfig,
    });

    await this.computeManager.createVm(
      this.vmName,
      nicId,
      undefined, // No data disk — Azure Files provides persistence
      this.vmSize,
      this.osDiskSizeGb,
      cloudInit,
      this.config.sshPublicKey,
      { profile: this.sanitizeName(options.profileName) },
      sharedInfra.managedIdentityId
    );
  }

  // ── configure ───────────────────────────────────────────────────────

  async configure(config: OpenClawConfigPayload): Promise<ConfigureResult> {
    const profileName = config.profileName;
    this.gatewayPort = config.gatewayPort;

    this.log(`Configuring Azure VM: ${profileName}`);

    if (!this.vmName) {
      this.deriveResourceNames(profileName);
    }

    const raw = this.transformConfig({ ...config.config });
    const configData = JSON.stringify(raw, null, 2);

    try {
      // Store in Key Vault
      if (this.keyVaultClient) {
        this.log(`Storing config in Key Vault: ${this.secretName}`);
        await this.ensureSecret(this.secretName, configData);
        this.log(`Key Vault secret updated`);
      }

      // Write config to Azure Files mount + restart container
      this.log(`Executing Run Command on VM: ${this.vmName}`);
      const base64Config = Buffer.from(configData).toString("base64");
      await this.computeManager.runCommand(this.vmName, [
        `echo '${base64Config}' | base64 -d > ${DEFAULT_MOUNT_PATH}/.openclaw/openclaw.json`,
        "docker restart openclaw-gateway 2>/dev/null || true",
      ]);
      this.log(`Configuration applied and container restarted`);

      return {
        success: true,
        message: `Configuration applied to VM "${this.vmName}" and container restarted`,
        requiresRestart: false,
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

  // ── Lifecycle ───────────────────────────────────────────────────────

  async start(): Promise<void> {
    await this.computeManager.startVm(this.vmName);
  }

  async stop(): Promise<void> {
    await this.computeManager.stopVm(this.vmName);
  }

  async restart(): Promise<void> {
    await this.computeManager.restartVm(this.vmName);
  }

  // ── getStatus ───────────────────────────────────────────────────────

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

      return { state, gatewayPort: this.gatewayPort, error };
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

  // ── getLogs ─────────────────────────────────────────────────────────

  async getLogs(options?: DeploymentLogOptions): Promise<string[]> {
    if (this.logsClient && this.config.logAnalyticsWorkspaceId) {
      return this.getLogsFromAnalytics(options);
    }

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
    if (!this.logsClient || !this.config.logAnalyticsWorkspaceId) return [];

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

  // ── getEndpoint ─────────────────────────────────────────────────────

  async getEndpoint(): Promise<GatewayEndpoint> {
    if (!this.cachedPublicIp) {
      this.cachedPublicIp = await this.networkManager.getPublicIpAddress(this.publicIpName);
    }

    const host = this.config.customDomain ?? this.cachedPublicIp;

    return {
      host,
      port: this.config.customDomain ? 443 : 80,
      protocol: this.config.customDomain ? "wss" : "ws",
    };
  }

  // ── destroy ─────────────────────────────────────────────────────────

  async destroy(): Promise<void> {
    this.log(`Destroying Azure resources for: ${this.vmName}`);

    // 1. Delete VM
    this.log(`[1/5] Deleting VM: ${this.vmName}`);
    await this.computeManager.deleteVm(this.vmName);

    // 2. Delete NIC (must happen after VM)
    this.log(`[2/5] Deleting NIC: ${this.nicName}`);
    await this.computeManager.deleteNic(this.nicName);

    // 3. Delete OS disk
    this.log(`[3/5] Deleting OS disk: ${this.vmName}-osdisk`);
    await this.computeManager.deleteDisk(`${this.vmName}-osdisk`);

    // 4. Delete public IP (must happen after NIC)
    this.log(`[4/5] Deleting public IP: ${this.publicIpName}`);
    await this.networkManager.deletePublicIp(this.publicIpName);

    // 5. Delete Key Vault secret
    if (this.keyVaultClient) {
      this.log(`[5/5] Deleting Key Vault secret: ${this.secretName}`);
      try {
        await this.keyVaultClient.beginDeleteSecret(this.secretName);
        this.log(`Key Vault secret deleted`);
      } catch {
        this.log(`Key Vault secret not found (skipped)`);
      }
    } else {
      this.log(`[5/5] Key Vault not configured (skipped)`);
    }

    this.log(`Azure resources destroyed (VNet/NSG/Storage preserved for reuse)`);
  }

  // ── Private helpers ─────────────────────────────────────────────────

  private async ensureSecret(name: string, value: string): Promise<void> {
    if (!this.keyVaultClient) return;
    try {
      await this.keyVaultClient.setSecret(name, value);
    } catch {
      // Secret storage failures are non-fatal
    }
  }

  // ── updateResources ─────────────────────────────────────────────────

  async updateResources(spec: ResourceSpec): Promise<ResourceUpdateResult> {
    this.log(`Starting resource update for VM: ${this.vmName}`);

    try {
      const targetVmSize = this.specToVmSize(spec);
      this.log(`Target VM size: ${targetVmSize}`);

      // 1. Deallocate VM
      this.log(`[1/3] Deallocating VM: ${this.vmName}`);
      await this.computeManager.stopVm(this.vmName);
      this.log(`VM deallocated`);

      // 2. Change VM size
      this.log(`[2/3] Changing VM size to: ${targetVmSize}`);
      await this.computeManager.resizeVm(this.vmName, targetVmSize);
      this.log(`VM size changed`);

      // 3. Start VM
      this.log(`[3/3] Starting VM`);
      await this.computeManager.startVm(this.vmName);
      this.log(`VM started`);

      this.log(`Resource update complete!`);

      return {
        success: true,
        message: `Azure VM resources updated to ${targetVmSize}`,
        requiresRestart: true,
        estimatedDowntime: 90,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(`Resource update failed: ${errorMsg}`, "stderr");

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

  // ── getResources ────────────────────────────────────────────────────

  async getResources(): Promise<ResourceSpec> {
    const vm = await this.computeClient.virtualMachines.get(
      this.config.resourceGroup,
      this.vmName
    );

    const vmSize = vm.hardwareProfile?.vmSize ?? this.vmSize;
    return this.vmSizeToSpec(vmSize);
  }

  // ── Resource spec conversion ────────────────────────────────────────

  private specToVmSize(spec: ResourceSpec): string {
    for (const [, tierSpec] of Object.entries(AZURE_TIER_SPECS)) {
      if (spec.cpu === tierSpec.cpu && spec.memory === tierSpec.memory) {
        return tierSpec.vmSize ?? "Standard_B2s";
      }
    }

    if (spec.memory >= 8192) return "Standard_D2s_v3";
    if (spec.memory >= 4096 || spec.cpu >= 2048) return "Standard_B2s";
    return "Standard_B1ms";
  }

  private vmSizeToSpec(vmSize: string): ResourceSpec {
    switch (vmSize) {
      case "Standard_B1ms":
        return { cpu: 1024, memory: 2048, dataDiskSizeGb: 0 };
      case "Standard_B2s":
        return { cpu: 2048, memory: 4096, dataDiskSizeGb: 0 };
      case "Standard_D2s_v3":
        return { cpu: 2048, memory: 8192, dataDiskSizeGb: 0 };
      default:
        return { cpu: 1024, memory: 2048, dataDiskSizeGb: 0 };
    }
  }

  // ── getMetadata ─────────────────────────────────────────────────────

  getMetadata(): AdapterMetadata {
    return {
      type: DeploymentTargetType.AZURE_VM,
      displayName: "Azure Virtual Machine",
      icon: "azure",
      description: "Run OpenClaw on Azure VM with Caddy reverse proxy and sandbox support",
      status: "ready",
      provisioningSteps: [
        { id: "validate_config", name: "Validate configuration" },
        { id: "security_audit", name: "Security audit" },
        { id: "create_vnet", name: "Create Virtual Network" },
        { id: "create_nsg", name: "Create Network Security Group" },
        { id: "create_subnet", name: "Create subnet" },
        { id: "create_storage", name: "Create Storage Account + File Share" },
        { id: "create_identity", name: "Create Managed Identity" },
        { id: "create_keyvault", name: "Create Key Vault" },
        { id: "assign_roles", name: "Assign RBAC roles" },
        { id: "store_secret", name: "Store config in Key Vault" },
        { id: "create_public_ip", name: "Create static public IP" },
        { id: "create_nic", name: "Create network interface" },
        { id: "create_vm", name: "Create VM instance", estimatedDurationSec: 120 },
        { id: "cloud_init", name: "Install Docker, Sysbox, Caddy", estimatedDurationSec: 90 },
        { id: "mount_azure_files", name: "Mount Azure Files" },
        { id: "start_openclaw", name: "Start OpenClaw container", estimatedDurationSec: 60 },
        { id: "wait_for_gateway", name: "Wait for Gateway", estimatedDurationSec: 30 },
        { id: "health_check", name: "Health check" },
      ],
      resourceUpdateSteps: [
        { id: "validate_resources", name: "Validate resource configuration" },
        { id: "deallocate_vm", name: "Deallocate VM instance" },
        { id: "resize_vm", name: "Change VM size", estimatedDurationSec: 60 },
        { id: "start_vm", name: "Start VM instance", estimatedDurationSec: 60 },
        { id: "verify_completion", name: "Verify completion" },
      ],
      operationSteps: {
        install: "create_vm",
        start: "wait_for_gateway",
      },
      capabilities: {
        scaling: true,
        sandbox: true,
        persistentStorage: true,
        httpsEndpoint: true,
        logStreaming: true,
      },
      credentials: [
        {
          key: "subscriptionId",
          displayName: "Azure Subscription ID",
          description: "Azure subscription identifier",
          required: true,
          sensitive: false,
        },
        {
          key: "resourceGroup",
          displayName: "Resource Group",
          description: "Azure resource group name",
          required: true,
          sensitive: false,
        },
        {
          key: "region",
          displayName: "Azure Region",
          description: "Azure region (e.g., eastus, westeurope)",
          required: true,
          sensitive: false,
        },
        {
          key: "tenantId",
          displayName: "Azure Tenant ID",
          description: "Azure AD tenant ID for service principal auth",
          required: false,
          sensitive: false,
        },
        {
          key: "clientId",
          displayName: "Client ID",
          description: "Service principal application (client) ID",
          required: false,
          sensitive: false,
        },
        {
          key: "clientSecret",
          displayName: "Client Secret",
          description: "Service principal secret",
          required: false,
          sensitive: true,
        },
      ],
      vaultType: "azure-account",
      tierSpecs: AZURE_TIER_SPECS,
    };
  }
}
