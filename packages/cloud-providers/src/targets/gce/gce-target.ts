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
import { GCE_TIER_SPECS } from "../../interface/resource-spec";
import type { GceConfig } from "./gce-config";

const DEFAULT_MACHINE_TYPE = "e2-small";
const DEFAULT_BOOT_DISK_SIZE_GB = 20;
const DEFAULT_DATA_DISK_SIZE_GB = 10;
const OPERATION_POLL_INTERVAL_MS = 5_000;
const OPERATION_TIMEOUT_MS = 600_000; // 10 minutes

/**
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
export class GceTarget implements DeploymentTarget {
  readonly type = DeploymentTargetType.GCE;

  private readonly config: GceConfig;
  private readonly machineType: string;
  private readonly bootDiskSizeGb: number;
  private readonly dataDiskSizeGb: number;

  // GCP clients
  private readonly instancesClient: InstancesClient;
  private readonly disksClient: DisksClient;
  private readonly networksClient: NetworksClient;
  private readonly subnetworksClient: SubnetworksClient;
  private readonly firewallsClient: FirewallsClient;
  private readonly addressesClient: GlobalAddressesClient;
  private readonly backendServicesClient: BackendServicesClient;
  private readonly urlMapsClient: UrlMapsClient;
  private readonly httpProxiesClient: TargetHttpProxiesClient;
  private readonly httpsProxiesClient: TargetHttpsProxiesClient;
  private readonly forwardingRulesClient: GlobalForwardingRulesClient;
  private readonly instanceGroupsClient: InstanceGroupsClient;
  private readonly securityPoliciesClient: SecurityPoliciesClient;
  private readonly globalOperationsClient: GlobalOperationsClient;
  private readonly zoneOperationsClient: ZoneOperationsClient;
  private readonly regionOperationsClient: RegionOperationsClient;
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

  /** Log callback for streaming progress to the UI */
  private onLog?: (line: string, stream: "stdout" | "stderr") => void;

  constructor(config: GceConfig) {
    this.config = config;
    this.machineType = config.machineType ?? DEFAULT_MACHINE_TYPE;
    this.bootDiskSizeGb = config.bootDiskSizeGb ?? DEFAULT_BOOT_DISK_SIZE_GB;
    this.dataDiskSizeGb = config.dataDiskSizeGb ?? DEFAULT_DATA_DISK_SIZE_GB;

    // GCP client options
    const clientOptions = config.keyFilePath
      ? { keyFilename: config.keyFilePath }
      : {};

    // Initialize GCP clients
    this.instancesClient = new InstancesClient(clientOptions);
    this.disksClient = new DisksClient(clientOptions);
    this.networksClient = new NetworksClient(clientOptions);
    this.subnetworksClient = new SubnetworksClient(clientOptions);
    this.firewallsClient = new FirewallsClient(clientOptions);
    this.addressesClient = new GlobalAddressesClient(clientOptions);
    this.backendServicesClient = new BackendServicesClient(clientOptions);
    this.urlMapsClient = new UrlMapsClient(clientOptions);
    this.httpProxiesClient = new TargetHttpProxiesClient(clientOptions);
    this.httpsProxiesClient = new TargetHttpsProxiesClient(clientOptions);
    this.forwardingRulesClient = new GlobalForwardingRulesClient(clientOptions);
    this.instanceGroupsClient = new InstanceGroupsClient(clientOptions);
    this.securityPoliciesClient = new SecurityPoliciesClient(clientOptions);
    this.globalOperationsClient = new GlobalOperationsClient(clientOptions);
    this.zoneOperationsClient = new ZoneOperationsClient(clientOptions);
    this.regionOperationsClient = new RegionOperationsClient(clientOptions);
    this.secretClient = new SecretManagerServiceClient(clientOptions);
    this.logging = new Logging({
      projectId: config.projectId,
      ...clientOptions,
    });

    // Derive resource names from profileName if available (for re-instantiation)
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

  /**
   * Sanitize name for GCP resources.
   * Must be lowercase, start with a letter, contain only letters, numbers, hyphens.
   * Max 63 characters.
   */
  private sanitizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/^[^a-z]/, "a")
      .replace(/-+/g, "-")
      .replace(/-$/, "")
      .slice(0, 63);
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
      await this.ensureVpcNetwork();
      this.log(`VPC network ready`);

      // 3. Create Subnet
      this.log(`[3/13] Ensuring subnet: ${this.subnetName}`);
      await this.ensureSubnet();
      this.log(`Subnet ready`);

      // 4. Create Firewall rules
      this.log(`[4/13] Ensuring firewall rules: ${this.firewallName}`);
      await this.ensureFirewall();
      this.log(`Firewall rules ready`);

      // 5. Reserve external IP address
      this.log(`[5/13] Reserving external IP: ${this.externalIpName}`);
      await this.ensureExternalIp();
      this.log(`External IP reserved: ${this.cachedExternalIp || "(pending)"}`);

      // 6. Create Persistent Disk for data
      this.log(`[6/13] Creating persistent data disk: ${this.dataDiskName} (${this.dataDiskSizeGb}GB)`);
      await this.ensureDataDisk();
      this.log(`Persistent disk ready`);

      // 7. Create VM instance with Container-Optimized OS
      this.log(`[7/13] Creating VM instance: ${this.instanceName}`);
      await this.createVmInstance(options);
      this.log(`VM instance created`);

      // 8. Create unmanaged instance group for load balancer
      this.log(`[8/13] Creating instance group: ${this.instanceGroupName}`);
      await this.ensureInstanceGroup();
      this.log(`Instance group ready`);

      // 9. Create Cloud Armor security policy (if allowedCidr configured)
      if (this.config.allowedCidr && this.config.allowedCidr.length > 0) {
        this.log(`[9/13] Creating Cloud Armor security policy: ${this.securityPolicyName}`);
        await this.ensureSecurityPolicy();
        this.log(`Security policy ready`);
      } else {
        this.log(`[9/13] Skipping Cloud Armor (no allowedCidr configured)`);
      }

      // 10. Create Backend Service with instance group
      this.log(`[10/13] Creating backend service: ${this.backendServiceName}`);
      await this.ensureBackendService();
      this.log(`Backend service ready`);

      // 11. Create URL Map
      this.log(`[11/13] Creating URL map: ${this.urlMapName}`);
      await this.ensureUrlMap();
      this.log(`URL map ready`);

      // 12. Create HTTP(S) Proxy
      const proxyType = this.config.sslCertificateId ? "HTTPS" : "HTTP";
      this.log(`[12/13] Creating ${proxyType} proxy`);
      await this.ensureHttpProxy();
      this.log(`${proxyType} proxy ready`);

      // 13. Create Forwarding Rule
      this.log(`[13/13] Creating forwarding rule: ${this.forwardingRuleName}`);
      await this.ensureForwardingRule();
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

    // Apply the same config transformations as other deployment targets
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
      // Store config in Secret Manager (backup)
      this.log(`Storing configuration in Secret Manager: ${this.secretName}`);
      await this.ensureSecret(this.secretName, configData);
      this.log(`Secret Manager updated`);

      // Update VM instance metadata with new config
      this.log(`Updating VM metadata for instance: ${this.instanceName}`);
      await this.updateVmMetadata(configData);
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
    const [operation] = await this.instancesClient.start({
      project: this.config.projectId,
      zone: this.config.zone,
      instance: this.instanceName,
    });

    await this.waitForZoneOperation(operation, "start");
    this.log(`VM instance started`);
  }

  // ------------------------------------------------------------------
  // stop
  // ------------------------------------------------------------------

  async stop(): Promise<void> {
    this.log(`Stopping VM instance: ${this.instanceName}`);
    const [operation] = await this.instancesClient.stop({
      project: this.config.projectId,
      zone: this.config.zone,
      instance: this.instanceName,
    });

    await this.waitForZoneOperation(operation, "stop");
    this.log(`VM instance stopped`);
  }

  // ------------------------------------------------------------------
  // restart
  // ------------------------------------------------------------------

  async restart(): Promise<void> {
    this.log(`Restarting VM instance: ${this.instanceName}`);
    const [operation] = await this.instancesClient.reset({
      project: this.config.projectId,
      zone: this.config.zone,
      instance: this.instanceName,
    });

    await this.waitForZoneOperation(operation, "restart");
    this.log(`VM instance restarted`);
  }

  // ------------------------------------------------------------------
  // getStatus
  // ------------------------------------------------------------------

  async getStatus(): Promise<TargetStatus> {
    try {
      const [instance] = await this.instancesClient.get({
        project: this.config.projectId,
        zone: this.config.zone,
        instance: this.instanceName,
      });

      let state: TargetStatus["state"];
      let error: string | undefined;

      switch (instance.status) {
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
        default:
          state = "error";
          error = `Unknown VM status: ${instance.status}`;
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
      const [address] = await this.addressesClient.get({
        project: this.config.projectId,
        address: this.externalIpName,
      });
      this.cachedExternalIp = address.address ?? "";
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
    // Delete in reverse order of creation

    // 1. Delete Forwarding Rule
    this.log(`[1/11] Deleting forwarding rule: ${this.forwardingRuleName}`);
    try {
      const [operation] = await this.forwardingRulesClient.delete({
        project: this.config.projectId,
        forwardingRule: this.forwardingRuleName,
      });
      await this.waitForGlobalOperation(operation, "delete forwarding rule");
      this.log(`Forwarding rule deleted`);
    } catch {
      this.log(`Forwarding rule not found (skipped)`);
    }

    // 2. Delete HTTP(S) Proxy
    const proxyType = this.config.sslCertificateId ? "HTTPS" : "HTTP";
    this.log(`[2/11] Deleting ${proxyType} proxy`);
    try {
      if (this.config.sslCertificateId) {
        const [operation] = await this.httpsProxiesClient.delete({
          project: this.config.projectId,
          targetHttpsProxy: this.httpsProxyName,
        });
        await this.waitForGlobalOperation(operation, "delete HTTPS proxy");
      } else {
        const [operation] = await this.httpProxiesClient.delete({
          project: this.config.projectId,
          targetHttpProxy: this.httpProxyName,
        });
        await this.waitForGlobalOperation(operation, "delete HTTP proxy");
      }
      this.log(`${proxyType} proxy deleted`);
    } catch {
      this.log(`${proxyType} proxy not found (skipped)`);
    }

    // 3. Delete URL Map
    this.log(`[3/11] Deleting URL map: ${this.urlMapName}`);
    try {
      const [operation] = await this.urlMapsClient.delete({
        project: this.config.projectId,
        urlMap: this.urlMapName,
      });
      await this.waitForGlobalOperation(operation, "delete URL map");
      this.log(`URL map deleted`);
    } catch {
      this.log(`URL map not found (skipped)`);
    }

    // 4. Delete Backend Service
    this.log(`[4/11] Deleting backend service: ${this.backendServiceName}`);
    try {
      const [operation] = await this.backendServicesClient.delete({
        project: this.config.projectId,
        backendService: this.backendServiceName,
      });
      await this.waitForGlobalOperation(operation, "delete backend service");
      this.log(`Backend service deleted`);
    } catch {
      this.log(`Backend service not found (skipped)`);
    }

    // 5. Delete Security Policy
    this.log(`[5/11] Deleting security policy: ${this.securityPolicyName}`);
    try {
      const [operation] = await this.securityPoliciesClient.delete({
        project: this.config.projectId,
        securityPolicy: this.securityPolicyName,
      });
      await this.waitForGlobalOperation(operation, "delete security policy");
      this.log(`Security policy deleted`);
    } catch {
      this.log(`Security policy not found (skipped)`);
    }

    // 6. Delete Instance Group
    this.log(`[6/11] Deleting instance group: ${this.instanceGroupName}`);
    try {
      const [operation] = await this.instanceGroupsClient.delete({
        project: this.config.projectId,
        zone: this.config.zone,
        instanceGroup: this.instanceGroupName,
      });
      await this.waitForZoneOperation(operation, "delete instance group");
      this.log(`Instance group deleted`);
    } catch {
      this.log(`Instance group not found (skipped)`);
    }

    // 7. Delete VM Instance
    this.log(`[7/11] Deleting VM instance: ${this.instanceName}`);
    try {
      const [operation] = await this.instancesClient.delete({
        project: this.config.projectId,
        zone: this.config.zone,
        instance: this.instanceName,
      });
      await this.waitForZoneOperation(operation, "delete VM");
      this.log(`VM instance deleted`);
    } catch {
      this.log(`VM instance not found (skipped)`);
    }

    // 8. Delete Data Disk
    this.log(`[8/11] Deleting data disk: ${this.dataDiskName}`);
    try {
      const [operation] = await this.disksClient.delete({
        project: this.config.projectId,
        zone: this.config.zone,
        disk: this.dataDiskName,
      });
      await this.waitForZoneOperation(operation, "delete disk");
      this.log(`Data disk deleted`);
    } catch {
      this.log(`Data disk not found (skipped)`);
    }

    // 9. Delete External IP
    this.log(`[9/11] Deleting external IP: ${this.externalIpName}`);
    try {
      const [operation] = await this.addressesClient.delete({
        project: this.config.projectId,
        address: this.externalIpName,
      });
      await this.waitForGlobalOperation(operation, "delete external IP");
      this.log(`External IP deleted`);
    } catch {
      this.log(`External IP not found (skipped)`);
    }

    // 10. Delete Firewall
    this.log(`[10/11] Deleting firewall: ${this.firewallName}`);
    try {
      const [operation] = await this.firewallsClient.delete({
        project: this.config.projectId,
        firewall: this.firewallName,
      });
      await this.waitForGlobalOperation(operation, "delete firewall");
      this.log(`Firewall deleted`);
    } catch {
      this.log(`Firewall not found (skipped)`);
    }

    // 11. Delete Secret
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
  // Private helpers - VPC Infrastructure
  // ------------------------------------------------------------------

  private async ensureVpcNetwork(): Promise<void> {
    try {
      await this.networksClient.get({
        project: this.config.projectId,
        network: this.vpcNetworkName,
      });
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.message.includes("NOT_FOUND") || error.message.includes("404"))
      ) {
        const [operation] = await this.networksClient.insert({
          project: this.config.projectId,
          networkResource: {
            name: this.vpcNetworkName,
            autoCreateSubnetworks: false, // Custom subnets
            description: `Clawster VPC for ${this.instanceName}`,
          },
        });
        await this.waitForGlobalOperation(operation, "create VPC network");
      } else {
        throw error;
      }
    }
  }

  private async ensureSubnet(): Promise<void> {
    try {
      await this.subnetworksClient.get({
        project: this.config.projectId,
        region: this.region,
        subnetwork: this.subnetName,
      });
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.message.includes("NOT_FOUND") || error.message.includes("404"))
      ) {
        const [operation] = await this.subnetworksClient.insert({
          project: this.config.projectId,
          region: this.region,
          subnetworkResource: {
            name: this.subnetName,
            network: `projects/${this.config.projectId}/global/networks/${this.vpcNetworkName}`,
            ipCidrRange: "10.0.0.0/24",
            region: this.region,
            description: `Clawster subnet for ${this.instanceName}`,
          },
        });
        await this.waitForRegionOperation(operation, "create subnet");
      } else {
        throw error;
      }
    }
  }

  private async ensureFirewall(): Promise<void> {
    try {
      await this.firewallsClient.get({
        project: this.config.projectId,
        firewall: this.firewallName,
      });
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.message.includes("NOT_FOUND") || error.message.includes("404"))
      ) {
        const [operation] = await this.firewallsClient.insert({
          project: this.config.projectId,
          firewallResource: {
            name: this.firewallName,
            network: `projects/${this.config.projectId}/global/networks/${this.vpcNetworkName}`,
            description: `Allow traffic to Clawster instance ${this.instanceName}`,
            allowed: [
              {
                IPProtocol: "tcp",
                ports: [String(this.gatewayPort)],
              },
            ],
            // Allow traffic from GCP health check ranges and the LB
            sourceRanges: [
              "130.211.0.0/22", // GCP health check
              "35.191.0.0/16", // GCP health check
            ],
            targetTags: [`clawster-${this.sanitizeName(this.instanceName)}`],
          },
        });
        await this.waitForGlobalOperation(operation, "create firewall rules");
      } else {
        throw error;
      }
    }
  }

  private async ensureExternalIp(): Promise<void> {
    try {
      const [address] = await this.addressesClient.get({
        project: this.config.projectId,
        address: this.externalIpName,
      });
      this.cachedExternalIp = address.address ?? "";
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.message.includes("NOT_FOUND") || error.message.includes("404"))
      ) {
        const [operation] = await this.addressesClient.insert({
          project: this.config.projectId,
          addressResource: {
            name: this.externalIpName,
            description: `External IP for Clawster instance ${this.instanceName}`,
            networkTier: "PREMIUM",
          },
        });
        await this.waitForGlobalOperation(operation, "reserve external IP");

        // Get the newly created IP
        const [address] = await this.addressesClient.get({
          project: this.config.projectId,
          address: this.externalIpName,
        });
        this.cachedExternalIp = address.address ?? "";
      } else {
        throw error;
      }
    }
  }

  // ------------------------------------------------------------------
  // Private helpers - Persistent Disk
  // ------------------------------------------------------------------

  private async ensureDataDisk(): Promise<void> {
    try {
      await this.disksClient.get({
        project: this.config.projectId,
        zone: this.config.zone,
        disk: this.dataDiskName,
      });
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.message.includes("NOT_FOUND") || error.message.includes("404"))
      ) {
        const [operation] = await this.disksClient.insert({
          project: this.config.projectId,
          zone: this.config.zone,
          diskResource: {
            name: this.dataDiskName,
            sizeGb: String(this.dataDiskSizeGb),
            type: `zones/${this.config.zone}/diskTypes/pd-standard`,
            description: `Persistent data disk for Clawster instance ${this.instanceName}`,
          },
        });
        await this.waitForZoneOperation(operation, "create data disk");
      } else {
        throw error;
      }
    }
  }

  // ------------------------------------------------------------------
  // Private helpers - VM Instance
  // ------------------------------------------------------------------

  private async createVmInstance(options: InstallOptions): Promise<void> {
    const imageUri = this.config.image ?? "node:22-slim";
    const networkTag = `clawster-${this.sanitizeName(options.profileName)}`;

    // Startup script that:
    // 1. Formats and mounts the data disk
    // 2. Installs Sysbox runtime for secure Docker-in-Docker (sandbox mode)
    // 3. Pulls the config from metadata
    // 4. Runs OpenClaw in Docker with Sysbox runtime (for sandbox)
    const startupScript = `#!/bin/bash
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

    const [operation] = await this.instancesClient.insert({
      project: this.config.projectId,
      zone: this.config.zone,
      instanceResource: {
        name: this.instanceName,
        machineType: `zones/${this.config.zone}/machineTypes/${this.machineType}`,
        description: `Clawster OpenClaw instance for ${options.profileName}`,
        tags: {
          items: [networkTag],
        },
        disks: [
          {
            boot: true,
            autoDelete: true,
            initializeParams: {
              // Container-Optimized OS - has Docker pre-installed
              sourceImage: "projects/cos-cloud/global/images/family/cos-stable",
              diskSizeGb: String(this.bootDiskSizeGb),
              diskType: `zones/${this.config.zone}/diskTypes/pd-standard`,
            },
          },
          {
            // Attach the data disk
            boot: false,
            autoDelete: false,
            source: `zones/${this.config.zone}/disks/${this.dataDiskName}`,
            deviceName: this.dataDiskName,
          },
        ],
        networkInterfaces: [
          {
            network: `projects/${this.config.projectId}/global/networks/${this.vpcNetworkName}`,
            subnetwork: `projects/${this.config.projectId}/regions/${this.region}/subnetworks/${this.subnetName}`,
            // No external IP - traffic goes through LB
            accessConfigs: [],
          },
        ],
        metadata: {
          items: metadataItems,
        },
        labels: {
          "clawster-managed": "true",
          "clawster-profile": this.sanitizeName(options.profileName),
        },
        serviceAccounts: [
          {
            scopes: [
              "https://www.googleapis.com/auth/cloud-platform",
            ],
          },
        ],
      },
    });

    await this.waitForZoneOperation(operation, "create VM instance");
  }

  private async updateVmMetadata(configData: string): Promise<void> {
    // Get current instance
    const [instance] = await this.instancesClient.get({
      project: this.config.projectId,
      zone: this.config.zone,
      instance: this.instanceName,
    });

    // Update metadata
    const currentItems = instance.metadata?.items ?? [];
    const newItems = currentItems.filter((item) => item.key !== "openclaw-config");
    newItems.push({ key: "openclaw-config", value: configData });

    const [operation] = await this.instancesClient.setMetadata({
      project: this.config.projectId,
      zone: this.config.zone,
      instance: this.instanceName,
      metadataResource: {
        fingerprint: instance.metadata?.fingerprint,
        items: newItems,
      },
    });

    await this.waitForZoneOperation(operation, "update VM metadata");
  }

  // ------------------------------------------------------------------
  // Private helpers - Instance Group
  // ------------------------------------------------------------------

  private async ensureInstanceGroup(): Promise<void> {
    try {
      await this.instanceGroupsClient.get({
        project: this.config.projectId,
        zone: this.config.zone,
        instanceGroup: this.instanceGroupName,
      });
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.message.includes("NOT_FOUND") || error.message.includes("404"))
      ) {
        // Create unmanaged instance group
        const [operation] = await this.instanceGroupsClient.insert({
          project: this.config.projectId,
          zone: this.config.zone,
          instanceGroupResource: {
            name: this.instanceGroupName,
            description: `Instance group for Clawster ${this.instanceName}`,
            network: `projects/${this.config.projectId}/global/networks/${this.vpcNetworkName}`,
            namedPorts: [
              {
                name: "http",
                port: this.gatewayPort,
              },
            ],
          },
        });
        await this.waitForZoneOperation(operation, "create instance group");

        // Add instance to group
        const [addOperation] = await this.instanceGroupsClient.addInstances({
          project: this.config.projectId,
          zone: this.config.zone,
          instanceGroup: this.instanceGroupName,
          instanceGroupsAddInstancesRequestResource: {
            instances: [
              {
                instance: `zones/${this.config.zone}/instances/${this.instanceName}`,
              },
            ],
          },
        });
        await this.waitForZoneOperation(addOperation, "add instance to group");
      } else {
        throw error;
      }
    }
  }

  // ------------------------------------------------------------------
  // Private helpers - Load Balancer Infrastructure
  // ------------------------------------------------------------------

  private async ensureSecurityPolicy(): Promise<void> {
    const allowedCidr = this.config.allowedCidr ?? ["0.0.0.0/0"];

    try {
      await this.securityPoliciesClient.get({
        project: this.config.projectId,
        securityPolicy: this.securityPolicyName,
      });
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.message.includes("NOT_FOUND") || error.message.includes("404"))
      ) {
        // Build rules for allowed CIDRs
        const rules = allowedCidr.map((cidr, index) => ({
          priority: 1000 + index,
          match: {
            versionedExpr: "SRC_IPS_V1" as const,
            config: {
              srcIpRanges: [cidr],
            },
          },
          action: "allow",
          description: `Allow traffic from ${cidr}`,
        }));

        // Add default deny rule
        rules.push({
          priority: 2147483647, // Lowest priority (highest number)
          match: {
            versionedExpr: "SRC_IPS_V1" as const,
            config: {
              srcIpRanges: ["*"],
            },
          },
          action: "deny(403)",
          description: "Deny all other traffic",
        });

        const [operation] = await this.securityPoliciesClient.insert({
          project: this.config.projectId,
          securityPolicyResource: {
            name: this.securityPolicyName,
            description: `Cloud Armor policy for Clawster instance ${this.instanceName}`,
            rules,
          },
        });
        await this.waitForGlobalOperation(operation, "create security policy");
      } else {
        throw error;
      }
    }
  }

  private async ensureBackendService(): Promise<void> {
    const instanceGroupSelfLink = `https://www.googleapis.com/compute/v1/projects/${this.config.projectId}/zones/${this.config.zone}/instanceGroups/${this.instanceGroupName}`;

    try {
      await this.backendServicesClient.get({
        project: this.config.projectId,
        backendService: this.backendServiceName,
      });
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.message.includes("NOT_FOUND") || error.message.includes("404"))
      ) {
        const backendService: Record<string, unknown> = {
          name: this.backendServiceName,
          description: `Backend service for Clawster ${this.instanceName}`,
          backends: [
            {
              group: instanceGroupSelfLink,
              balancingMode: "UTILIZATION",
              maxUtilization: 0.8,
            },
          ],
          protocol: "HTTP",
          portName: "http",
          healthChecks: [], // We'll use a simple TCP health check created inline
          loadBalancingScheme: "EXTERNAL_MANAGED",
        };

        // Attach security policy if it exists
        if (this.config.allowedCidr && this.config.allowedCidr.length > 0) {
          backendService.securityPolicy = `https://www.googleapis.com/compute/v1/projects/${this.config.projectId}/global/securityPolicies/${this.securityPolicyName}`;
        }

        const [operation] = await this.backendServicesClient.insert({
          project: this.config.projectId,
          backendServiceResource: backendService,
        });
        await this.waitForGlobalOperation(operation, "create backend service");
      } else {
        throw error;
      }
    }
  }

  private async ensureUrlMap(): Promise<void> {
    const backendServiceSelfLink = `https://www.googleapis.com/compute/v1/projects/${this.config.projectId}/global/backendServices/${this.backendServiceName}`;

    try {
      await this.urlMapsClient.get({
        project: this.config.projectId,
        urlMap: this.urlMapName,
      });
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.message.includes("NOT_FOUND") || error.message.includes("404"))
      ) {
        const [operation] = await this.urlMapsClient.insert({
          project: this.config.projectId,
          urlMapResource: {
            name: this.urlMapName,
            description: `URL map for Clawster ${this.instanceName}`,
            defaultService: backendServiceSelfLink,
          },
        });
        await this.waitForGlobalOperation(operation, "create URL map");
      } else {
        throw error;
      }
    }
  }

  private async ensureHttpProxy(): Promise<void> {
    const urlMapSelfLink = `https://www.googleapis.com/compute/v1/projects/${this.config.projectId}/global/urlMaps/${this.urlMapName}`;

    if (this.config.sslCertificateId) {
      // HTTPS Proxy
      try {
        await this.httpsProxiesClient.get({
          project: this.config.projectId,
          targetHttpsProxy: this.httpsProxyName,
        });
      } catch (error: unknown) {
        if (
          error instanceof Error &&
          (error.message.includes("NOT_FOUND") || error.message.includes("404"))
        ) {
          const [operation] = await this.httpsProxiesClient.insert({
            project: this.config.projectId,
            targetHttpsProxyResource: {
              name: this.httpsProxyName,
              description: `HTTPS proxy for Clawster ${this.instanceName}`,
              urlMap: urlMapSelfLink,
              sslCertificates: [this.config.sslCertificateId],
            },
          });
          await this.waitForGlobalOperation(operation, "create HTTPS proxy");
        } else {
          throw error;
        }
      }
    } else {
      // HTTP Proxy
      try {
        await this.httpProxiesClient.get({
          project: this.config.projectId,
          targetHttpProxy: this.httpProxyName,
        });
      } catch (error: unknown) {
        if (
          error instanceof Error &&
          (error.message.includes("NOT_FOUND") || error.message.includes("404"))
        ) {
          const [operation] = await this.httpProxiesClient.insert({
            project: this.config.projectId,
            targetHttpProxyResource: {
              name: this.httpProxyName,
              description: `HTTP proxy for Clawster ${this.instanceName}`,
              urlMap: urlMapSelfLink,
            },
          });
          await this.waitForGlobalOperation(operation, "create HTTP proxy");
        } else {
          throw error;
        }
      }
    }
  }

  private async ensureForwardingRule(): Promise<void> {
    try {
      await this.forwardingRulesClient.get({
        project: this.config.projectId,
        forwardingRule: this.forwardingRuleName,
      });
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.message.includes("NOT_FOUND") || error.message.includes("404"))
      ) {
        const proxyName = this.config.sslCertificateId
          ? this.httpsProxyName
          : this.httpProxyName;
        const proxyType = this.config.sslCertificateId ? "targetHttpsProxies" : "targetHttpProxies";
        const proxySelfLink = `https://www.googleapis.com/compute/v1/projects/${this.config.projectId}/global/${proxyType}/${proxyName}`;
        const ipSelfLink = `https://www.googleapis.com/compute/v1/projects/${this.config.projectId}/global/addresses/${this.externalIpName}`;

        const [operation] = await this.forwardingRulesClient.insert({
          project: this.config.projectId,
          forwardingRuleResource: {
            name: this.forwardingRuleName,
            description: `Forwarding rule for Clawster ${this.instanceName}`,
            IPAddress: ipSelfLink,
            IPProtocol: "TCP",
            portRange: this.config.sslCertificateId ? "443" : "80",
            target: proxySelfLink,
            loadBalancingScheme: "EXTERNAL_MANAGED",
            networkTier: "PREMIUM",
          },
        });
        await this.waitForGlobalOperation(operation, "create forwarding rule");
      } else {
        throw error;
      }
    }
  }

  // ------------------------------------------------------------------
  // Private helpers - Operation waiting
  // ------------------------------------------------------------------

  private async waitForGlobalOperation(operation: unknown, description?: string): Promise<void> {
    const op = operation as { name?: string };
    if (!op?.name) return;

    const operationName = op.name.split("/").pop() ?? op.name;
    const label = description ?? operationName;
    let lastStatus = "";

    const start = Date.now();
    while (Date.now() - start < OPERATION_TIMEOUT_MS) {
      const [result] = await this.globalOperationsClient.get({
        project: this.config.projectId,
        operation: operationName,
      });

      const status = String(result.status ?? "UNKNOWN");
      const progress = result.progress ?? 0;

      // Log status changes
      if (status !== lastStatus) {
        const elapsed = Math.round((Date.now() - start) / 1000);
        this.log(`  [${label}] ${status}${progress > 0 ? ` (${progress}%)` : ""} - ${elapsed}s elapsed`);
        lastStatus = status;
      }

      if (result.status === "DONE") {
        if (result.error?.errors?.length) {
          const errorMsg = result.error.errors[0]?.message ?? "Operation failed";
          this.log(`  [${label}] FAILED: ${errorMsg}`, "stderr");
          throw new Error(errorMsg);
        }
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, OPERATION_POLL_INTERVAL_MS));
    }
    this.log(`  [${label}] TIMEOUT after ${OPERATION_TIMEOUT_MS / 1000}s`, "stderr");
    throw new Error(`Operation timed out: ${operationName}`);
  }

  private async waitForZoneOperation(operation: unknown, description?: string): Promise<void> {
    const op = operation as { name?: string };
    if (!op?.name) return;

    const operationName = op.name.split("/").pop() ?? op.name;
    const label = description ?? operationName;
    let lastStatus = "";

    const start = Date.now();
    while (Date.now() - start < OPERATION_TIMEOUT_MS) {
      const [result] = await this.zoneOperationsClient.get({
        project: this.config.projectId,
        zone: this.config.zone,
        operation: operationName,
      });

      const status = String(result.status ?? "UNKNOWN");
      const progress = result.progress ?? 0;

      // Log status changes
      if (status !== lastStatus) {
        const elapsed = Math.round((Date.now() - start) / 1000);
        this.log(`  [${label}] ${status}${progress > 0 ? ` (${progress}%)` : ""} - ${elapsed}s elapsed`);
        lastStatus = status;
      }

      if (result.status === "DONE") {
        if (result.error?.errors?.length) {
          const errorMsg = result.error.errors[0]?.message ?? "Operation failed";
          this.log(`  [${label}] FAILED: ${errorMsg}`, "stderr");
          throw new Error(errorMsg);
        }
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, OPERATION_POLL_INTERVAL_MS));
    }
    this.log(`  [${label}] TIMEOUT after ${OPERATION_TIMEOUT_MS / 1000}s`, "stderr");
    throw new Error(`Operation timed out: ${operationName}`);
  }

  private async waitForRegionOperation(operation: unknown, description?: string): Promise<void> {
    const op = operation as { name?: string };
    if (!op?.name) return;

    const operationName = op.name.split("/").pop() ?? op.name;
    const label = description ?? operationName;
    let lastStatus = "";

    const start = Date.now();
    while (Date.now() - start < OPERATION_TIMEOUT_MS) {
      const [result] = await this.regionOperationsClient.get({
        project: this.config.projectId,
        region: this.region,
        operation: operationName,
      });

      const status = String(result.status ?? "UNKNOWN");
      const progress = result.progress ?? 0;

      // Log status changes
      if (status !== lastStatus) {
        const elapsed = Math.round((Date.now() - start) / 1000);
        this.log(`  [${label}] ${status}${progress > 0 ? ` (${progress}%)` : ""} - ${elapsed}s elapsed`);
        lastStatus = status;
      }

      if (result.status === "DONE") {
        if (result.error?.errors?.length) {
          const errorMsg = result.error.errors[0]?.message ?? "Operation failed";
          this.log(`  [${label}] FAILED: ${errorMsg}`, "stderr");
          throw new Error(errorMsg);
        }
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, OPERATION_POLL_INTERVAL_MS));
    }
    this.log(`  [${label}] TIMEOUT after ${OPERATION_TIMEOUT_MS / 1000}s`, "stderr");
    throw new Error(`Operation timed out: ${operationName}`);
  }

  // ------------------------------------------------------------------
  // updateResources
  // ------------------------------------------------------------------

  async updateResources(spec: ResourceSpec): Promise<ResourceUpdateResult> {
    this.log(`Starting resource update for VM: ${this.instanceName}`);

    try {
      // GCE resource updates require:
      // 1. Stop the VM
      // 2. Change machine type
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

      // Determine target machine type from spec
      const targetMachineType = this.specToMachineType(spec);
      this.log(`Target machine type: ${targetMachineType}`);

      // 1. Stop VM
      this.log(`[1/4] Stopping VM instance: ${this.instanceName}`);
      const [stopOp] = await this.instancesClient.stop({
        project: this.config.projectId,
        zone: this.config.zone,
        instance: this.instanceName,
      });
      await this.waitForZoneOperation(stopOp, "stop VM");
      this.log(`VM stopped`);

      // 2. Change machine type
      this.log(`[2/4] Changing machine type to: ${targetMachineType}`);
      const [setMachineOp] = await this.instancesClient.setMachineType({
        project: this.config.projectId,
        zone: this.config.zone,
        instance: this.instanceName,
        instancesSetMachineTypeRequestResource: {
          machineType: `zones/${this.config.zone}/machineTypes/${targetMachineType}`,
        },
      });
      await this.waitForZoneOperation(setMachineOp, "change machine type");
      this.log(`Machine type changed`);

      // 3. Resize data disk if requested and larger than current
      if (spec.dataDiskSizeGb && spec.dataDiskSizeGb > this.dataDiskSizeGb) {
        this.log(`[3/4] Resizing data disk: ${this.dataDiskSizeGb}GB -> ${spec.dataDiskSizeGb}GB`);
        const [resizeDiskOp] = await this.disksClient.resize({
          project: this.config.projectId,
          zone: this.config.zone,
          disk: this.dataDiskName,
          disksResizeRequestResource: {
            sizeGb: String(spec.dataDiskSizeGb),
          },
        });
        await this.waitForZoneOperation(resizeDiskOp, "resize disk");
        this.log(`Disk resized to ${spec.dataDiskSizeGb}GB`);
      } else {
        this.log(`[3/4] Disk resize skipped (no change needed)`);
      }

      // 4. Start VM
      this.log(`[4/4] Starting VM instance`);
      const [startOp] = await this.instancesClient.start({
        project: this.config.projectId,
        zone: this.config.zone,
        instance: this.instanceName,
      });
      await this.waitForZoneOperation(startOp, "start VM");
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
        await this.instancesClient.start({
          project: this.config.projectId,
          zone: this.config.zone,
          instance: this.instanceName,
        });
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
    const [instance] = await this.instancesClient.get({
      project: this.config.projectId,
      zone: this.config.zone,
      instance: this.instanceName,
    });

    const machineTypeUrl = instance.machineType ?? "";
    const machineType = machineTypeUrl.split("/").pop() ?? this.machineType;

    // Get disk size
    const [disk] = await this.disksClient.get({
      project: this.config.projectId,
      zone: this.config.zone,
      disk: this.dataDiskName,
    });

    const diskSizeGb = disk.sizeGb
      ? typeof disk.sizeGb === "string"
        ? parseInt(disk.sizeGb, 10)
        : Number(disk.sizeGb)
      : this.dataDiskSizeGb;

    // Convert machine type to ResourceSpec
    return this.machineTypeToSpec(machineType, diskSizeGb);
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
