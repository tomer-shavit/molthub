/**
 * GCE Target
 *
 * GceTarget manages an OpenClaw gateway instance running on
 * Google Compute Engine VM.
 *
 * ARCHITECTURE: VM-based deployment with full Docker support.
 * Unlike Cloud Run, Compute Engine provides:
 * - Persistent Disk for WhatsApp sessions (survives restarts)
 * - Full Docker daemon access for sandbox mode (Docker-in-Docker)
 * - No cold starts - VM is always running
 * - State survives VM restarts
 *
 * Security:
 *   Internet -> External LB -> Instance Group NEG -> GCE VM (firewall-protected)
 *                                                       |
 *                                                 Persistent Disk
 */

import { BaseDeploymentTarget } from "../../base/base-deployment-target";
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

/**
 * GCE tier specifications.
 */
const GCE_TIER_SPECS: Record<Exclude<ResourceTier, "custom">, TierSpec> = {
  light: {
    tier: "light",
    cpu: 256, // 0.25 vCPU equivalent
    memory: 1024,
    dataDiskSizeGb: 5,
    machineType: "e2-micro",
  },
  standard: {
    tier: "standard",
    cpu: 2048, // 2 vCPU equivalent
    memory: 2048,
    dataDiskSizeGb: 10,
    machineType: "e2-small",
  },
  performance: {
    tier: "performance",
    cpu: 2048, // 2 vCPU equivalent
    memory: 4096,
    dataDiskSizeGb: 20,
    machineType: "e2-medium",
  },
};
import type { AdapterMetadata, SelfDescribingDeploymentTarget } from "../../interface/adapter-metadata";

import type {
  IGceOperationManager,
  IGceNetworkManager,
  IGceComputeManager,
  IGceLoadBalancerManager,
  IGceSecretManager,
  IGceLoggingManager,
} from "./managers";
import {
  GceDefaultSecretManager,
  GceDefaultLoggingManager,
} from "./managers";
import { GceManagerFactory } from "./gce-manager-factory";
import type { GceManagers } from "./gce-manager-factory";
import type { GceConfig } from "./gce-config";
import type { VmInstanceConfig, LoadBalancerNames, FirewallRule } from "./types";

const DEFAULT_MACHINE_TYPE = "e2-small";
const DEFAULT_BOOT_DISK_SIZE_GB = 20;
const DEFAULT_DATA_DISK_SIZE_GB = 10;

/**
 * Options for constructing a GceTarget with dependency injection support.
 *
 * @example
 * ```typescript
 * // Using with @clawster/adapters-gcp services for secret and logging
 * import { SecretManagerService, CloudLoggingService } from "@clawster/adapters-gcp";
 * import { GceSecretManagerAdapter, GceLoggingManagerAdapter } from "@clawster/cloud-providers";
 *
 * const secretService = new SecretManagerService({ projectId: "my-project" });
 * const loggingService = new CloudLoggingService({ projectId: "my-project" });
 *
 * const target = new GceTarget({
 *   config: gceConfig,
 *   managers: {
 *     ...coreManagers,
 *     secretManager: new GceSecretManagerAdapter(secretService),
 *     loggingManager: new GceLoggingManagerAdapter(loggingService),
 *   },
 * });
 * ```
 */
export interface GceTargetOptions {
  /** GCE configuration */
  config: GceConfig;
  /**
   * Optional managers for dependency injection (useful for testing or using
   * @clawster/adapters-gcp services instead of direct SDK imports).
   *
   * If secretManager or loggingManager are not provided, defaults using
   * direct @google-cloud/* SDK will be created internally.
   */
  managers?: GceManagers;
}

/**
 * GCE deployment target for OpenClaw gateway.
 */
export class GceTarget extends BaseDeploymentTarget implements SelfDescribingDeploymentTarget {
  readonly type = DeploymentTargetType.GCE;

  private readonly config: GceConfig;
  private readonly machineType: string;
  private readonly bootDiskSizeGb: number;
  private readonly dataDiskSizeGb: number;

  // Managers (using interfaces for dependency inversion)
  private readonly operationManager: IGceOperationManager;
  private readonly networkManager: IGceNetworkManager;
  private readonly computeManager: IGceComputeManager;
  private readonly loadBalancerManager: IGceLoadBalancerManager;
  private readonly secretManager: IGceSecretManager;
  private readonly loggingManager: IGceLoggingManager;

  /** Derived resource names - set during install */
  private instanceName = "";
  private dataDiskName = "";
  private secretName = "";
  private vpcNetworkName = "";
  private subnetName = "";
  private firewallName = "";
  private externalIpName = "";
  private instanceGroupName = "";
  private backendServiceName = "";
  private urlMapName = "";
  private httpProxyName = "";
  private httpsProxyName = "";
  private forwardingRuleName = "";
  private securityPolicyName = "";
  private gatewayPort = 18789;

  /** Cached external IP for getEndpoint */
  private cachedExternalIp = "";

  /**
   * Create a GceTarget with just a config (backward compatible).
   * @param config - GCE configuration
   */
  constructor(config: GceConfig);
  /**
   * Create a GceTarget with options including optional managers for DI.
   * @param options - Options including config and optional managers
   */
  constructor(options: GceTargetOptions);
  constructor(configOrOptions: GceConfig | GceTargetOptions) {
    super();

    // Determine if we received options or just config (backward compatibility)
    const isOptions = (arg: GceConfig | GceTargetOptions): arg is GceTargetOptions =>
      "config" in arg && typeof (arg as GceTargetOptions).config === "object";

    const config = isOptions(configOrOptions) ? configOrOptions.config : configOrOptions;
    const providedManagers = isOptions(configOrOptions) ? configOrOptions.managers : undefined;

    this.config = config;
    this.machineType = config.machineType ?? DEFAULT_MACHINE_TYPE;
    this.bootDiskSizeGb = config.bootDiskSizeGb ?? DEFAULT_BOOT_DISK_SIZE_GB;
    this.dataDiskSizeGb = config.dataDiskSizeGb ?? DEFAULT_DATA_DISK_SIZE_GB;

    // Use provided managers (for testing/DI) or create via factory (production)
    if (providedManagers) {
      // Dependency injection path - use provided managers
      this.operationManager = providedManagers.operationManager;
      this.networkManager = providedManagers.networkManager;
      this.computeManager = providedManagers.computeManager;
      this.loadBalancerManager = providedManagers.loadBalancerManager;

      // Use provided secret/logging managers or create defaults
      const logCallback = (msg: string, stream: "stdout" | "stderr") => this.log(msg, stream);
      this.secretManager = providedManagers.secretManager ?? new GceDefaultSecretManager({
        projectId: config.projectId,
        keyFilePath: config.keyFilePath,
        log: logCallback,
      });
      this.loggingManager = providedManagers.loggingManager ?? new GceDefaultLoggingManager({
        projectId: config.projectId,
        keyFilePath: config.keyFilePath,
        log: logCallback,
      });
    } else {
      // Factory path - create managers with proper wiring
      const logCallback = (msg: string, stream: "stdout" | "stderr") => this.log(msg, stream);
      const managers = GceManagerFactory.createManagers({
        projectId: config.projectId,
        zone: config.zone,
        region: this.region,
        keyFilePath: config.keyFilePath,
        log: logCallback,
      });

      this.operationManager = managers.operationManager;
      this.networkManager = managers.networkManager;
      this.computeManager = managers.computeManager;
      this.loadBalancerManager = managers.loadBalancerManager;
      this.secretManager = managers.secretManager!;
      this.loggingManager = managers.loggingManager!;
    }

    // Derive resource names from profileName if available (for re-instantiation)
    if (config.profileName) {
      this.deriveResourceNames(config.profileName);
    }
  }

  // ------------------------------------------------------------------
  // Resource name helpers
  // ------------------------------------------------------------------

  /**
   * GCE-specific name sanitization.
   * GCE resource names must:
   * - Be lowercase
   * - Start with a letter
   * - Contain only letters, numbers, and hyphens
   * - Max 63 characters
   */
  protected override sanitizeName(name: string, maxLength = 63): string {
    let sanitized = name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/^[^a-z]/, "a") // Must start with a letter
      .replace(/-+/g, "-")
      .replace(/-$/, "")
      .slice(0, maxLength);

    if (!sanitized) {
      throw new Error(`Invalid name: "${name}" produces empty sanitized value`);
    }

    return sanitized;
  }

  private deriveResourceNames(profileName: string): void {
    const sanitized = this.sanitizeName(profileName);
    this.instanceName = `clawster-${sanitized}`;
    this.dataDiskName = `clawster-data-${sanitized}`;
    this.secretName = `clawster-${sanitized}-config`;
    this.vpcNetworkName = this.config.vpcNetworkName ?? `clawster-vpc-${sanitized}`;
    this.subnetName = this.config.subnetName ?? `clawster-subnet-${sanitized}`;
    this.firewallName = `clawster-fw-${sanitized}`;
    this.externalIpName = this.config.externalIpName ?? `clawster-ip-${sanitized}`;
    this.instanceGroupName = `clawster-ig-${sanitized}`;
    this.backendServiceName = `clawster-backend-${sanitized}`;
    this.urlMapName = `clawster-urlmap-${sanitized}`;
    this.httpProxyName = `clawster-http-proxy-${sanitized}`;
    this.httpsProxyName = `clawster-https-proxy-${sanitized}`;
    this.forwardingRuleName = `clawster-fwd-${sanitized}`;
    this.securityPolicyName = `clawster-security-${sanitized}`;
  }

  /** Extract region from zone (e.g., "us-central1-a" -> "us-central1") */
  private get region(): string {
    const parts = this.config.zone.split("-");
    return parts.slice(0, -1).join("-");
  }

  // ------------------------------------------------------------------
  // install
  // ------------------------------------------------------------------

  async install(options: InstallOptions): Promise<InstallResult> {
    const profileName = options.profileName;
    this.gatewayPort = options.port;
    this.deriveResourceNames(profileName);

    this.log(`Starting GCE VM installation for ${profileName}`);
    this.log(`Zone: ${this.config.zone}, Machine type: ${this.machineType}`);

    try {
      // 1. Create Secret Manager secret (empty initially, configure() fills it)
      this.log(`[1/13] Creating Secret Manager secret: ${this.secretName}`);
      await this.ensureSecret(this.secretName, "{}");
      this.log(`Secret Manager secret created`);

      // 2. Create VPC Network (if it doesn't exist)
      this.log(`[2/13] Ensuring VPC network: ${this.vpcNetworkName}`);
      await this.networkManager.ensureVpcNetwork(this.vpcNetworkName, {
        description: `Clawster VPC for ${this.instanceName}`,
      });
      this.log(`VPC network ready`);

      // 3. Create Subnet
      this.log(`[3/13] Ensuring subnet: ${this.subnetName}`);
      await this.networkManager.ensureSubnet(this.vpcNetworkName, this.subnetName, "10.0.0.0/24");
      this.log(`Subnet ready`);

      // 4. Create Firewall rules
      this.log(`[4/13] Ensuring firewall rules: ${this.firewallName}`);
      const firewallRules: FirewallRule[] = [
        {
          protocol: "tcp",
          ports: [String(this.gatewayPort)],
          sourceRanges: [
            "130.211.0.0/22", // GCP health check
            "35.191.0.0/16", // GCP health check
          ],
          targetTags: [`clawster-${this.sanitizeName(this.instanceName)}`],
          description: `Allow traffic to Clawster instance ${this.instanceName}`,
        },
      ];
      await this.networkManager.ensureFirewall(this.firewallName, this.vpcNetworkName, firewallRules);
      this.log(`Firewall rules ready`);

      // 5. Reserve external IP address
      this.log(`[5/13] Reserving external IP: ${this.externalIpName}`);
      this.cachedExternalIp = await this.networkManager.ensureExternalIp(this.externalIpName);
      this.log(`External IP reserved: ${this.cachedExternalIp || "(pending)"}`);

      // 6. Create Persistent Disk for data
      this.log(`[6/13] Creating persistent data disk: ${this.dataDiskName} (${this.dataDiskSizeGb}GB)`);
      await this.computeManager.ensureDataDisk(this.dataDiskName, this.dataDiskSizeGb);
      this.log(`Persistent disk ready`);

      // 7. Create VM instance with Container-Optimized OS
      this.log(`[7/13] Creating VM instance: ${this.instanceName}`);
      await this.createVmInstance(options);
      this.log(`VM instance created`);

      // 8. Create unmanaged instance group for load balancer
      this.log(`[8/13] Creating instance group: ${this.instanceGroupName}`);
      await this.computeManager.ensureInstanceGroup(
        this.instanceGroupName,
        this.instanceName,
        { name: "http", port: this.gatewayPort },
        this.vpcNetworkName
      );
      this.log(`Instance group ready`);

      // 9. Create Cloud Armor security policy (if allowedCidr configured)
      if (this.config.allowedCidr && this.config.allowedCidr.length > 0) {
        this.log(`[9/13] Creating Cloud Armor security policy: ${this.securityPolicyName}`);
        await this.loadBalancerManager.ensureSecurityPolicy(
          this.securityPolicyName,
          this.config.allowedCidr
        );
        this.log(`Security policy ready`);
      } else {
        this.log(`[9/13] Skipping Cloud Armor (no allowedCidr configured)`);
      }

      // 10. Create Backend Service with instance group
      this.log(`[10/13] Creating backend service: ${this.backendServiceName}`);
      const instanceGroupUrl = `https://www.googleapis.com/compute/v1/projects/${this.config.projectId}/zones/${this.config.zone}/instanceGroups/${this.instanceGroupName}`;
      await this.loadBalancerManager.ensureBackendService(
        this.backendServiceName,
        instanceGroupUrl,
        this.config.allowedCidr?.length ? this.securityPolicyName : undefined
      );
      this.log(`Backend service ready`);

      // 11. Create URL Map
      this.log(`[11/13] Creating URL map: ${this.urlMapName}`);
      const backendServiceUrl = `https://www.googleapis.com/compute/v1/projects/${this.config.projectId}/global/backendServices/${this.backendServiceName}`;
      await this.loadBalancerManager.ensureUrlMap(this.urlMapName, backendServiceUrl);
      this.log(`URL map ready`);

      // 12. Create HTTP(S) Proxy
      const proxyType = this.config.sslCertificateId ? "HTTPS" : "HTTP";
      this.log(`[12/13] Creating ${proxyType} proxy`);
      const urlMapUrl = `https://www.googleapis.com/compute/v1/projects/${this.config.projectId}/global/urlMaps/${this.urlMapName}`;
      let proxyUrl: string;
      if (this.config.sslCertificateId) {
        proxyUrl = await this.loadBalancerManager.ensureHttpsProxy(
          this.httpsProxyName,
          urlMapUrl,
          this.config.sslCertificateId
        );
      } else {
        proxyUrl = await this.loadBalancerManager.ensureHttpProxy(this.httpProxyName, urlMapUrl);
      }
      this.log(`${proxyType} proxy ready`);

      // 13. Create Forwarding Rule
      this.log(`[13/13] Creating forwarding rule: ${this.forwardingRuleName}`);
      await this.loadBalancerManager.ensureForwardingRule(
        this.forwardingRuleName,
        proxyUrl,
        this.externalIpName,
        this.config.sslCertificateId ? 443 : 80
      );
      this.log(`Forwarding rule ready`);

      this.log(`GCE VM installation complete!`);

      return {
        success: true,
        instanceId: this.instanceName,
        message: `GCE VM "${this.instanceName}" created (VPC + External LB, persistent disk) in ${this.config.zone}`,
        serviceName: this.instanceName,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(`GCE install failed: ${errorMsg}`, "stderr");
      return {
        success: false,
        instanceId: this.instanceName,
        message: `GCE install failed: ${errorMsg}`,
      };
    }
  }

  // ------------------------------------------------------------------
  // configure
  // ------------------------------------------------------------------

  async configure(config: OpenClawConfigPayload): Promise<ConfigureResult> {
    const profileName = config.profileName;
    this.gatewayPort = config.gatewayPort;

    this.log(`Configuring GCE instance: ${profileName}`);

    if (!this.secretName) {
      this.deriveResourceNames(profileName);
    }

    // Use base class transformConfig for standard transformations
    const transformed = this.transformConfig(config.config as Record<string, unknown>);

    // Apply GCE-specific transformation: gateway.bind = "lan"
    if (transformed.gateway && typeof transformed.gateway === "object") {
      const gw = { ...(transformed.gateway as Record<string, unknown>) };
      gw.bind = "lan";
      delete gw.host;
      delete gw.port;
      transformed.gateway = gw;
    }

    const configData = JSON.stringify(transformed, null, 2);

    try {
      // Store config in Secret Manager (backup)
      this.log(`Storing configuration in Secret Manager: ${this.secretName}`);
      await this.ensureSecret(this.secretName, configData);
      this.log(`Secret Manager updated`);

      // Update VM instance metadata with new config
      this.log(`Updating VM metadata for instance: ${this.instanceName}`);
      await this.computeManager.updateVmMetadata(this.instanceName, {
        "openclaw-config": configData,
      });
      this.log(`VM metadata updated`);

      this.log(`Configuration complete`);

      return {
        success: true,
        message: `Configuration stored in Secret Manager as "${this.secretName}" and applied to VM metadata`,
        requiresRestart: true,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(`Configuration failed: ${errorMsg}`, "stderr");
      return {
        success: false,
        message: `Failed to store config: ${errorMsg}`,
        requiresRestart: false,
      };
    }
  }

  // ------------------------------------------------------------------
  // start
  // ------------------------------------------------------------------

  async start(): Promise<void> {
    this.log(`Starting VM instance: ${this.instanceName}`);
    await this.computeManager.startInstance(this.instanceName);
    this.log(`VM instance started`);
  }

  // ------------------------------------------------------------------
  // stop
  // ------------------------------------------------------------------

  async stop(): Promise<void> {
    this.log(`Stopping VM instance: ${this.instanceName}`);
    await this.computeManager.stopInstance(this.instanceName);
    this.log(`VM instance stopped`);
  }

  // ------------------------------------------------------------------
  // restart
  // ------------------------------------------------------------------

  async restart(): Promise<void> {
    this.log(`Restarting VM instance: ${this.instanceName}`);
    await this.computeManager.resetInstance(this.instanceName);
    this.log(`VM instance restarted`);
  }

  // ------------------------------------------------------------------
  // getStatus
  // ------------------------------------------------------------------

  async getStatus(): Promise<TargetStatus> {
    try {
      const vmStatus = await this.computeManager.getInstanceStatus(this.instanceName);

      let state: TargetStatus["state"];
      let error: string | undefined;

      switch (vmStatus) {
        case "RUNNING":
          state = "running";
          break;
        case "STOPPED":
        case "TERMINATED":
          state = "stopped";
          break;
        case "STAGING":
        case "PROVISIONING":
        case "SUSPENDING":
        case "SUSPENDED":
        case "REPAIRING":
          state = "running"; // Transitional states
          break;
        case "UNKNOWN":
        default:
          state = "error";
          error = `Unknown VM status: ${vmStatus}`;
      }

      return {
        state,
        gatewayPort: this.gatewayPort,
        error,
      };
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.message.includes("NOT_FOUND") || error.message.includes("404"))
      ) {
        return { state: "not-installed" };
      }
      return { state: "error", error: String(error) };
    }
  }

  // ------------------------------------------------------------------
  // getLogs
  // ------------------------------------------------------------------

  async getLogs(options?: DeploymentLogOptions): Promise<string[]> {
    return this.loggingManager.getLogs(this.instanceName, this.config.zone, {
      since: options?.since,
      lines: options?.lines,
      filter: options?.filter,
    });
  }

  // ------------------------------------------------------------------
  // getEndpoint
  // ------------------------------------------------------------------

  async getEndpoint(): Promise<GatewayEndpoint> {
    // CRITICAL: Return the External Load Balancer IP, NEVER the VM's ephemeral IP
    if (!this.cachedExternalIp) {
      this.cachedExternalIp = await this.networkManager.getExternalIp(this.externalIpName);
    }

    if (!this.cachedExternalIp) {
      throw new Error("External IP address not found");
    }

    return {
      host: this.config.customDomain ?? this.cachedExternalIp,
      port: this.config.sslCertificateId ? 443 : 80,
      protocol: this.config.sslCertificateId ? "wss" : "ws",
    };
  }

  // ------------------------------------------------------------------
  // destroy
  // ------------------------------------------------------------------

  async destroy(): Promise<void> {
    this.log(`Destroying GCE resources for: ${this.instanceName}`);

    // Delete load balancer components in reverse order
    const lbNames: LoadBalancerNames = {
      backendService: this.backendServiceName,
      urlMap: this.urlMapName,
      httpProxy: this.httpProxyName,
      httpsProxy: this.httpsProxyName,
      forwardingRule: this.forwardingRuleName,
      securityPolicy: this.securityPolicyName,
      instanceGroup: this.instanceGroupName,
      externalIp: this.externalIpName,
    };

    this.log(`[1/11] Deleting load balancer components`);
    await this.loadBalancerManager.destroyLoadBalancer(lbNames, !!this.config.sslCertificateId);

    // Delete instance group
    this.log(`[6/11] Deleting instance group: ${this.instanceGroupName}`);
    await this.computeManager.deleteInstanceGroup(this.instanceGroupName);
    this.log(`Instance group deleted`);

    // Delete VM Instance
    this.log(`[7/11] Deleting VM instance: ${this.instanceName}`);
    await this.computeManager.deleteInstance(this.instanceName);
    this.log(`VM instance deleted`);

    // Delete Data Disk
    this.log(`[8/11] Deleting data disk: ${this.dataDiskName}`);
    await this.computeManager.deleteDisk(this.dataDiskName);
    this.log(`Data disk deleted`);

    // Delete External IP
    this.log(`[9/11] Deleting external IP: ${this.externalIpName}`);
    await this.networkManager.releaseExternalIp(this.externalIpName);
    this.log(`External IP deleted`);

    // Delete Firewall
    this.log(`[10/11] Deleting firewall: ${this.firewallName}`);
    await this.networkManager.deleteFirewall(this.firewallName);
    this.log(`Firewall deleted`);

    // Delete Secret
    this.log(`[11/11] Deleting secret: ${this.secretName}`);
    try {
      await this.secretManager.deleteSecret(this.secretName);
      this.log(`Secret deleted`);
    } catch {
      this.log(`Secret not found (skipped)`);
    }

    this.log(`GCE resources destroyed (VPC/Subnet preserved for shared use)`);
  }

  // ------------------------------------------------------------------
  // updateResources
  // ------------------------------------------------------------------

  async updateResources(spec: ResourceSpec): Promise<ResourceUpdateResult> {
    this.log(`Starting resource update for VM: ${this.instanceName}`);

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

      // Determine target machine type from spec
      const targetMachineType = this.specToMachineType(spec);
      this.log(`Target machine type: ${targetMachineType}`);

      // 1. Stop VM
      this.log(`[1/4] Stopping VM instance: ${this.instanceName}`);
      await this.computeManager.stopInstance(this.instanceName);
      this.log(`VM stopped`);

      // 2. Change machine type
      this.log(`[2/4] Changing machine type to: ${targetMachineType}`);
      await this.computeManager.resizeInstance(this.instanceName, targetMachineType);
      this.log(`Machine type changed`);

      // 3. Resize data disk if requested and larger than current
      if (spec.dataDiskSizeGb && spec.dataDiskSizeGb > this.dataDiskSizeGb) {
        this.log(`[3/4] Resizing data disk: ${this.dataDiskSizeGb}GB -> ${spec.dataDiskSizeGb}GB`);
        await this.computeManager.resizeDisk(this.dataDiskName, spec.dataDiskSizeGb);
        this.log(`Disk resized to ${spec.dataDiskSizeGb}GB`);
      } else {
        this.log(`[3/4] Disk resize skipped (no change needed)`);
      }

      // 4. Start VM
      this.log(`[4/4] Starting VM instance`);
      await this.computeManager.startInstance(this.instanceName);
      this.log(`VM started`);

      this.log(`Resource update complete!`);

      return {
        success: true,
        message: `GCE VM resources updated to ${targetMachineType}${spec.dataDiskSizeGb ? `, ${spec.dataDiskSizeGb}GB disk` : ""}`,
        requiresRestart: true,
        estimatedDowntime: 60,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(`Resource update failed: ${errorMsg}`, "stderr");

      // Try to start VM again if we stopped it
      this.log(`Attempting to recover by starting VM...`);
      try {
        await this.computeManager.startInstance(this.instanceName);
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
    // Get current instance to read machine type
    const instance = await this.computeManager.getInstance(this.instanceName);
    if (!instance) {
      throw new Error(`Instance ${this.instanceName} not found`);
    }

    const machineTypeUrl = (instance as { machineType?: string }).machineType ?? "";
    const machineType = machineTypeUrl.split("/").pop() ?? this.machineType;

    // Get disk size
    const disk = await this.computeManager.getDisk(this.dataDiskName);
    const diskSizeGb = disk?.sizeGb
      ? typeof disk.sizeGb === "string"
        ? parseInt(disk.sizeGb, 10)
        : Number(disk.sizeGb)
      : this.dataDiskSizeGb;

    // Convert machine type to ResourceSpec
    return this.machineTypeToSpec(machineType, diskSizeGb);
  }

  // ------------------------------------------------------------------
  // Private helpers - Secret Manager (now uses manager interface)
  // ------------------------------------------------------------------

  private async ensureSecret(name: string, value: string): Promise<void> {
    await this.secretManager.ensureSecret(name, value);
  }

  // ------------------------------------------------------------------
  // Private helpers - VM Instance creation
  // ------------------------------------------------------------------

  private async createVmInstance(options: InstallOptions): Promise<void> {
    const imageUri = this.config.image ?? "node:22-slim";
    const networkTag = `clawster-${this.sanitizeName(options.profileName)}`;

    // Startup script that:
    // 1. Formats and mounts the data disk
    // 2. Installs Sysbox runtime for secure Docker-in-Docker (sandbox mode)
    // 3. Pulls the config from metadata
    // 4. Runs OpenClaw in Docker with Sysbox runtime (for sandbox)
    // Build middleware config for proxy sidecar (if any)
    const enabledMiddlewares = (options.middlewareConfig?.middlewares ?? []).filter((m) => m.enabled);
    const hasMiddleware = enabledMiddlewares.length > 0;

    const startupScript = this.buildStartupScript(imageUri, hasMiddleware);

    // Build metadata items
    const metadataItems: Array<{ key: string; value: string }> = [
      { key: "startup-script", value: startupScript },
      { key: "gateway-port", value: String(this.gatewayPort) },
      { key: "openclaw-config", value: "{}" },
    ];

    if (options.gatewayAuthToken) {
      metadataItems.push({ key: "gateway-token", value: options.gatewayAuthToken });
    }

    // Pass middleware config as metadata for the startup script proxy sidecar
    if (hasMiddleware) {
      const proxyConfig = JSON.stringify({
        externalPort: 18789,
        internalPort: 18789,
        internalHost: "openclaw-gateway",
        middlewares: enabledMiddlewares.map((m) => ({
          package: m.package,
          enabled: m.enabled,
          config: m.config,
        })),
      });
      metadataItems.push({ key: "middleware-config", value: proxyConfig });
    }

    // Add container env vars to metadata
    for (const [key, value] of Object.entries(options.containerEnv ?? {})) {
      metadataItems.push({ key: `env-${key}`, value });
    }

    const vmConfig: VmInstanceConfig = {
      name: this.instanceName,
      machineType: this.machineType,
      bootDisk: {
        sourceImage: "projects/cos-cloud/global/images/family/cos-stable",
        sizeGb: this.bootDiskSizeGb,
        diskType: "pd-standard",
      },
      dataDiskName: this.dataDiskName,
      networkName: this.vpcNetworkName,
      subnetName: this.subnetName,
      networkTags: [networkTag],
      metadata: metadataItems,
      labels: {
        "clawster-managed": "true",
        "clawster-profile": this.sanitizeName(options.profileName),
      },
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    };

    await this.computeManager.createVmInstance(vmConfig);
  }

  private buildStartupScript(imageUri: string, hasMiddleware = false): string {
    const diskSetup = `# Format and mount data disk if not already mounted
DATA_DISK="/dev/disk/by-id/google-${this.dataDiskName}"
MOUNT_POINT="/mnt/openclaw"

if ! mountpoint -q "$MOUNT_POINT"; then
  sudo mkdir -p "$MOUNT_POINT"

  # Check if disk needs formatting
  if ! blkid "$DATA_DISK"; then
    sudo mkfs.ext4 -F "$DATA_DISK"
  fi

  sudo mount "$DATA_DISK" "$MOUNT_POINT"
  sudo chmod 777 "$MOUNT_POINT"

  # Add to fstab for persistence
  if ! grep -q "$MOUNT_POINT" /etc/fstab; then
    echo "$DATA_DISK $MOUNT_POINT ext4 defaults,nofail 0 2" | sudo tee -a /etc/fstab
  fi
fi`;

    const sysboxInstall = `# Install Sysbox runtime for secure Docker-in-Docker (sandbox mode)
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
fi`;

    const runtimeDetection = `# Determine which runtime to use
DOCKER_RUNTIME=""
if docker info --format '{{json .Runtimes}}' 2>/dev/null | grep -q 'sysbox-runc'; then
  DOCKER_RUNTIME="--runtime=sysbox-runc"
  echo "Using Sysbox runtime for secure Docker-in-Docker"
else
  echo "Warning: Sysbox not available, sandbox mode will be limited"
fi`;

    const metadataRead = `# Get config from instance metadata
GATEWAY_PORT=$(curl -s -H "Metadata-Flavor: Google" \\
  http://metadata.google.internal/computeMetadata/v1/instance/attributes/gateway-port || echo "${this.gatewayPort}")
GATEWAY_TOKEN=$(curl -s -H "Metadata-Flavor: Google" \\
  http://metadata.google.internal/computeMetadata/v1/instance/attributes/gateway-token || echo "")
OPENCLAW_CONFIG=$(curl -s -H "Metadata-Flavor: Google" \\
  http://metadata.google.internal/computeMetadata/v1/instance/attributes/openclaw-config || echo "{}")

# Create config directory
mkdir -p "$MOUNT_POINT/.openclaw"
echo "$OPENCLAW_CONFIG" > "$MOUNT_POINT/.openclaw/openclaw.json"`;

    if (hasMiddleware) {
      return `#!/bin/bash
set -e

${diskSetup}

${sysboxInstall}

${runtimeDetection}

${metadataRead}

# Read middleware config from metadata
MW_CONFIG=$(curl -s -H "Metadata-Flavor: Google" \\
  http://metadata.google.internal/computeMetadata/v1/instance/attributes/middleware-config || echo "")

# Create Docker network for middleware proxy
docker network create clawster-mw 2>/dev/null || true

# Clean up existing containers
docker rm -f openclaw-gateway 2>/dev/null || true
docker rm -f clawster-proxy 2>/dev/null || true

# Run OpenClaw on the network (internal only — no host port exposure)
docker run -d \\
  --name openclaw-gateway \\
  --restart=always \\
  --network clawster-mw \\
  $DOCKER_RUNTIME \\
  -v "$MOUNT_POINT/.openclaw:/home/node/.openclaw" \\
  -e OPENCLAW_GATEWAY_PORT=18789 \\
  -e OPENCLAW_GATEWAY_TOKEN="$GATEWAY_TOKEN" \\
  ${imageUri} \\
  sh -c "npx -y openclaw@latest gateway --port 18789 --verbose"

# Run middleware proxy on the same network, exposed to host
docker run -d \\
  --name clawster-proxy \\
  --restart=always \\
  --network clawster-mw \\
  -p $GATEWAY_PORT:18789 \\
  -e "CLAWSTER_MIDDLEWARE_CONFIG=$MW_CONFIG" \\
  node:22-slim \\
  sh -c "npx -y @clawster/middleware-proxy"

echo "Middleware proxy started on port $GATEWAY_PORT"
`;
    }

    return `#!/bin/bash
set -e

${diskSetup}

${sysboxInstall}

${runtimeDetection}

${metadataRead}

# Stop any existing container
docker rm -f openclaw-gateway 2>/dev/null || true

# Run OpenClaw in Docker with Sysbox runtime (for secure sandbox)
docker run -d \\
  --name openclaw-gateway \\
  --restart=always \\
  $DOCKER_RUNTIME \\
  -p $GATEWAY_PORT:$GATEWAY_PORT \\
  -v "$MOUNT_POINT/.openclaw:/home/node/.openclaw" \\
  -e OPENCLAW_GATEWAY_PORT=$GATEWAY_PORT \\
  -e OPENCLAW_GATEWAY_TOKEN="$GATEWAY_TOKEN" \\
  ${imageUri} \\
  sh -c "npx -y openclaw@latest gateway --port $GATEWAY_PORT --verbose"
`;
  }

  // ------------------------------------------------------------------
  // Resource spec conversion helpers
  // ------------------------------------------------------------------

  private specToMachineType(spec: ResourceSpec): string {
    // Find matching tier or use custom machine type logic
    for (const [, tierSpec] of Object.entries(GCE_TIER_SPECS)) {
      if (spec.cpu === tierSpec.cpu && spec.memory === tierSpec.memory) {
        return tierSpec.machineType ?? "e2-small";
      }
    }

    // For custom specs, map to closest GCE machine type
    // GCE e2 series: e2-micro (0.25 vCPU, 1GB), e2-small (2 vCPU, 2GB), e2-medium (2 vCPU, 4GB)
    if (spec.memory >= 4096) {
      return "e2-medium";
    } else if (spec.cpu >= 1024) {
      return "e2-small";
    }
    return "e2-micro";
  }

  private machineTypeToSpec(machineType: string, dataDiskSizeGb: number): ResourceSpec {
    // Map GCE machine types to ResourceSpec
    switch (machineType) {
      case "e2-micro":
        return { cpu: 256, memory: 1024, dataDiskSizeGb };
      case "e2-small":
        return { cpu: 2048, memory: 2048, dataDiskSizeGb };
      case "e2-medium":
        return { cpu: 2048, memory: 4096, dataDiskSizeGb };
      default:
        // For unknown types, return default
        return { cpu: 1024, memory: 2048, dataDiskSizeGb };
    }
  }

  // ------------------------------------------------------------------
  // getMetadata
  // ------------------------------------------------------------------

  /**
   * Return metadata describing this adapter's capabilities and provisioning steps.
   */
  getMetadata(): AdapterMetadata {
    return {
      type: DeploymentTargetType.GCE,
      displayName: "Google Compute Engine",
      icon: "gcp",
      description: "Run OpenClaw on GCE VM with persistent disk and sandbox support",
      status: "ready",
      provisioningSteps: [
        { id: "validate_config", name: "Validate configuration" },
        { id: "security_audit", name: "Security audit" },
        { id: "create_secret", name: "Create Secret Manager secret" },
        { id: "create_vpc", name: "Create VPC network" },
        { id: "create_subnet", name: "Create subnet" },
        { id: "create_firewall", name: "Create firewall rules" },
        { id: "reserve_ip", name: "Reserve external IP" },
        { id: "create_disk", name: "Create persistent disk" },
        { id: "create_vm", name: "Create VM instance", estimatedDurationSec: 120 },
        { id: "create_instance_group", name: "Create instance group" },
        { id: "create_security_policy", name: "Create Cloud Armor policy" },
        { id: "create_backend", name: "Create backend service" },
        { id: "create_url_map", name: "Create URL map" },
        { id: "create_proxy", name: "Create HTTP(S) proxy" },
        { id: "create_forwarding_rule", name: "Create forwarding rule" },
        { id: "wait_for_gateway", name: "Wait for Gateway", estimatedDurationSec: 30 },
        { id: "health_check", name: "Health check" },
      ],
      resourceUpdateSteps: [
        { id: "validate_resources", name: "Validate resource configuration" },
        { id: "stop_vm", name: "Stop VM instance" },
        { id: "resize_machine", name: "Change machine type", estimatedDurationSec: 60 },
        { id: "resize_disk", name: "Resize data disk" },
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
          key: "projectId",
          displayName: "GCP Project ID",
          description: "Google Cloud project ID",
          required: true,
          sensitive: false,
        },
        {
          key: "zone",
          displayName: "GCP Zone",
          description: "Compute Engine zone (e.g., us-central1-a)",
          required: true,
          sensitive: false,
        },
        {
          key: "keyFilePath",
          displayName: "Service Account Key File",
          description: "Path to service account JSON key file",
          required: false,
          sensitive: true,
        },
      ],
      vaultType: "gce-account",
      tierSpecs: GCE_TIER_SPECS,
    };
  }
}
