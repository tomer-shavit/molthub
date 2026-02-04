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

import {
  InstancesClient,
  DisksClient,
  NetworksClient,
  SubnetworksClient,
  FirewallsClient,
  GlobalAddressesClient,
  BackendServicesClient,
  UrlMapsClient,
  TargetHttpProxiesClient,
  TargetHttpsProxiesClient,
  GlobalForwardingRulesClient,
  InstanceGroupsClient,
  SecurityPoliciesClient,
  GlobalOperationsClient,
  ZoneOperationsClient,
  RegionOperationsClient,
} from "@google-cloud/compute";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { Logging } from "@google-cloud/logging";

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
import type { ResourceSpec, ResourceUpdateResult } from "../../interface/resource-spec";
import { GCE_TIER_SPECS } from "../../interface/resource-spec";

import {
  GceOperationManager,
  GceNetworkManager,
  GceComputeManager,
  GceLoadBalancerManager,
} from "./managers";
import type { GceConfig } from "./gce-config";
import type { VmInstanceConfig, LoadBalancerNames, FirewallRule } from "./types";

const DEFAULT_MACHINE_TYPE = "e2-small";
const DEFAULT_BOOT_DISK_SIZE_GB = 20;
const DEFAULT_DATA_DISK_SIZE_GB = 10;

/**
 * GCE deployment target for OpenClaw gateway.
 */
export class GceTarget extends BaseDeploymentTarget {
  readonly type = DeploymentTargetType.GCE;

  private readonly config: GceConfig;
  private readonly machineType: string;
  private readonly bootDiskSizeGb: number;
  private readonly dataDiskSizeGb: number;

  // Managers
  private readonly operationManager: GceOperationManager;
  private readonly networkManager: GceNetworkManager;
  private readonly computeManager: GceComputeManager;
  private readonly loadBalancerManager: GceLoadBalancerManager;

  // GCP clients (only for secret manager and logging which aren't in managers)
  private readonly secretClient: SecretManagerServiceClient;
  private readonly logging: Logging;

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

  constructor(config: GceConfig) {
    super();
    this.config = config;
    this.machineType = config.machineType ?? DEFAULT_MACHINE_TYPE;
    this.bootDiskSizeGb = config.bootDiskSizeGb ?? DEFAULT_BOOT_DISK_SIZE_GB;
    this.dataDiskSizeGb = config.dataDiskSizeGb ?? DEFAULT_DATA_DISK_SIZE_GB;

    // GCP client options
    const clientOptions = config.keyFilePath
      ? { keyFilename: config.keyFilePath }
      : {};

    // Initialize GCP clients
    const instancesClient = new InstancesClient(clientOptions);
    const disksClient = new DisksClient(clientOptions);
    const networksClient = new NetworksClient(clientOptions);
    const subnetworksClient = new SubnetworksClient(clientOptions);
    const firewallsClient = new FirewallsClient(clientOptions);
    const addressesClient = new GlobalAddressesClient(clientOptions);
    const backendServicesClient = new BackendServicesClient(clientOptions);
    const urlMapsClient = new UrlMapsClient(clientOptions);
    const httpProxiesClient = new TargetHttpProxiesClient(clientOptions);
    const httpsProxiesClient = new TargetHttpsProxiesClient(clientOptions);
    const forwardingRulesClient = new GlobalForwardingRulesClient(clientOptions);
    const instanceGroupsClient = new InstanceGroupsClient(clientOptions);
    const securityPoliciesClient = new SecurityPoliciesClient(clientOptions);
    const globalOperationsClient = new GlobalOperationsClient(clientOptions);
    const zoneOperationsClient = new ZoneOperationsClient(clientOptions);
    const regionOperationsClient = new RegionOperationsClient(clientOptions);
    this.secretClient = new SecretManagerServiceClient(clientOptions);
    this.logging = new Logging({
      projectId: config.projectId,
      ...clientOptions,
    });

    // Create log callback that uses base class log method
    const logCallback = (msg: string, stream: "stdout" | "stderr") => this.log(msg, stream);

    // Initialize operation manager
    this.operationManager = new GceOperationManager(
      globalOperationsClient,
      zoneOperationsClient,
      regionOperationsClient,
      config.projectId,
      config.zone,
      this.region,
      logCallback
    );

    // Initialize network manager
    this.networkManager = new GceNetworkManager(
      networksClient,
      subnetworksClient,
      firewallsClient,
      addressesClient,
      this.operationManager,
      config.projectId,
      this.region,
      logCallback
    );

    // Initialize compute manager
    this.computeManager = new GceComputeManager(
      instancesClient,
      disksClient,
      instanceGroupsClient,
      this.operationManager,
      config.projectId,
      config.zone,
      this.region,
      logCallback
    );

    // Initialize load balancer manager
    this.loadBalancerManager = new GceLoadBalancerManager(
      backendServicesClient,
      urlMapsClient,
      httpProxiesClient,
      httpsProxiesClient,
      forwardingRulesClient,
      securityPoliciesClient,
      this.operationManager,
      config.projectId,
      config.zone,
      logCallback
    );

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
    try {
      const log = this.logging.log("compute.googleapis.com%2Fstartup-script");

      const filter = [
        `resource.type="gce_instance"`,
        `resource.labels.instance_id="${this.instanceName}"`,
        `resource.labels.zone="${this.config.zone}"`,
      ];

      if (options?.since) {
        filter.push(`timestamp>="${options.since.toISOString()}"`);
      }

      const [entries] = await log.getEntries({
        filter: filter.join(" AND "),
        orderBy: "timestamp desc",
        pageSize: options?.lines ?? 100,
      });

      let lines = entries.map((entry) => {
        const data = entry.data as { message?: string; textPayload?: string } | string;
        if (typeof data === "string") return data;
        return data?.message ?? data?.textPayload ?? JSON.stringify(data);
      });

      if (options?.filter) {
        try {
          const pattern = new RegExp(options.filter, "i");
          lines = lines.filter((line) => pattern.test(line));
        } catch {
          const literal = options.filter.toLowerCase();
          lines = lines.filter((line) => line.toLowerCase().includes(literal));
        }
      }

      return lines.reverse(); // Return in chronological order
    } catch {
      return [];
    }
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
      const secretPath = `projects/${this.config.projectId}/secrets/${this.secretName}`;
      await this.secretClient.deleteSecret({ name: secretPath });
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
  // Private helpers - Secret Manager
  // ------------------------------------------------------------------

  private async ensureSecret(name: string, value: string): Promise<void> {
    const parent = `projects/${this.config.projectId}`;
    const secretPath = `${parent}/secrets/${name}`;

    try {
      // Check if secret exists
      await this.secretClient.getSecret({ name: secretPath });

      // Secret exists, add new version
      await this.secretClient.addSecretVersion({
        parent: secretPath,
        payload: {
          data: Buffer.from(value, "utf8"),
        },
      });
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.message.includes("NOT_FOUND") || error.message.includes("404"))
      ) {
        // Create secret
        await this.secretClient.createSecret({
          parent,
          secretId: name,
          secret: {
            replication: {
              automatic: {},
            },
          },
        });

        // Add initial version
        await this.secretClient.addSecretVersion({
          parent: secretPath,
          payload: {
            data: Buffer.from(value, "utf8"),
          },
        });
      } else {
        throw error;
      }
    }
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
    const startupScript = this.buildStartupScript(imageUri);

    // Build metadata items
    const metadataItems: Array<{ key: string; value: string }> = [
      { key: "startup-script", value: startupScript },
      { key: "gateway-port", value: String(this.gatewayPort) },
      { key: "openclaw-config", value: "{}" },
    ];

    if (options.gatewayAuthToken) {
      metadataItems.push({ key: "gateway-token", value: options.gatewayAuthToken });
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

  private buildStartupScript(imageUri: string): string {
    return `#!/bin/bash
set -e

# Format and mount data disk if not already mounted
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
fi

# Install Sysbox runtime for secure Docker-in-Docker (sandbox mode)
# Only install if not already available
# Using versioned release for stability and security
SYSBOX_VERSION="v0.6.4"
if ! docker info --format '{{json .Runtimes}}' 2>/dev/null | grep -q 'sysbox-runc'; then
  echo "Installing Sysbox $SYSBOX_VERSION for secure sandbox mode..."
  # Download to temp file (safer than curl | bash)
  SYSBOX_INSTALL_SCRIPT="/tmp/sysbox-install-$$.sh"
  curl -fsSL "https://raw.githubusercontent.com/nestybox/sysbox/$SYSBOX_VERSION/scr/install.sh" -o "$SYSBOX_INSTALL_SCRIPT"
  chmod +x "$SYSBOX_INSTALL_SCRIPT"
  "$SYSBOX_INSTALL_SCRIPT"
  rm -f "$SYSBOX_INSTALL_SCRIPT"
  # Restart Docker to pick up new runtime
  systemctl restart docker
  echo "Sysbox runtime installed successfully"
else
  echo "Sysbox runtime already available"
fi

# Determine which runtime to use
DOCKER_RUNTIME=""
if docker info --format '{{json .Runtimes}}' 2>/dev/null | grep -q 'sysbox-runc'; then
  DOCKER_RUNTIME="--runtime=sysbox-runc"
  echo "Using Sysbox runtime for secure Docker-in-Docker"
else
  echo "Warning: Sysbox not available, sandbox mode will be limited"
fi

# Get config from instance metadata
GATEWAY_PORT=$(curl -s -H "Metadata-Flavor: Google" \\
  http://metadata.google.internal/computeMetadata/v1/instance/attributes/gateway-port || echo "${this.gatewayPort}")
GATEWAY_TOKEN=$(curl -s -H "Metadata-Flavor: Google" \\
  http://metadata.google.internal/computeMetadata/v1/instance/attributes/gateway-token || echo "")
OPENCLAW_CONFIG=$(curl -s -H "Metadata-Flavor: Google" \\
  http://metadata.google.internal/computeMetadata/v1/instance/attributes/openclaw-config || echo "{}")

# Create config directory
mkdir -p "$MOUNT_POINT/.openclaw"
echo "$OPENCLAW_CONFIG" > "$MOUNT_POINT/.openclaw/openclaw.json"

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
}
