/**
 * GCE Target
 *
 * Manages an OpenClaw gateway instance running on Google Compute Engine.
 *
 * ARCHITECTURE: Caddy-on-VM with MIG auto-healing.
 *   Internet → Firewall → VM (ephemeral public IP) → Caddy → 127.0.0.1:port → OpenClaw (Sysbox)
 *
 * Resources per bot:
 *   - Instance Template (global) — VM spec + startup script
 *   - Health Check (global) — HTTP GET /health via Caddy
 *   - MIG (zonal) — single VM with auto-healing
 *   - Secret Manager secret — OpenClaw config
 *
 * Shared resources (per region):
 *   - VPC Network + Subnet + Firewall — created once, reused
 */

import { BaseDeploymentTarget } from "../../base/base-deployment-target";
import type { TransformOptions } from "../../base/config-transformer";
import { buildGceCaddyStartupScript } from "../../base/startup-script-builder";
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
import type { GceConfig } from "./gce-config";
import type { FirewallRule } from "./types";
import type {
  IGceOperationManager,
  IGceNetworkManager,
  IGceComputeManager,
  IGceSecretManager,
  IGceLoggingManager,
  InstanceTemplateConfig,
} from "./managers";
import {
  GceDefaultSecretManager,
  GceDefaultLoggingManager,
} from "./managers";
import { GceManagerFactory } from "./gce-manager-factory";
import type { GceManagers } from "./gce-manager-factory";

// ── Tier Specs ──────────────────────────────────────────────────────────

const GCE_TIER_SPECS: Record<Exclude<ResourceTier, "custom">, TierSpec> = {
  light: {
    tier: "light",
    cpu: 2048,
    memory: 4096,
    dataDiskSizeGb: 0,
    machineType: "e2-medium",
  },
  standard: {
    tier: "standard",
    cpu: 2048,
    memory: 4096,
    dataDiskSizeGb: 0,
    machineType: "e2-medium",
  },
  performance: {
    tier: "performance",
    cpu: 2048,
    memory: 8192,
    dataDiskSizeGb: 0,
    machineType: "e2-standard-2",
  },
};

// ── Defaults ────────────────────────────────────────────────────────────

const DEFAULT_MACHINE_TYPE = "e2-medium";
const DEFAULT_BOOT_DISK_SIZE_GB = 30;
const DEFAULT_SYSBOX_VERSION = "0.6.7";
const DEFAULT_SOURCE_IMAGE = "projects/ubuntu-os-cloud/global/images/family/ubuntu-2204-lts";

// ── Target Options ──────────────────────────────────────────────────────

export interface GceTargetOptions {
  config: GceConfig;
  managers?: GceManagers;
}

// ── Target Class ────────────────────────────────────────────────────────

export class GceTarget extends BaseDeploymentTarget implements SelfDescribingDeploymentTarget {
  readonly type = DeploymentTargetType.GCE;

  private readonly config: GceConfig;
  private machineType: string;
  private readonly bootDiskSizeGb: number;

  // Managers
  private readonly operationManager: IGceOperationManager;
  private readonly networkManager: IGceNetworkManager;
  private readonly computeManager: IGceComputeManager;
  private readonly secretManager: IGceSecretManager;
  private readonly loggingManager: IGceLoggingManager;

  /** Derived resource names */
  private instanceName = "";
  private templateName = "";
  private migName = "";
  private healthCheckName = "";
  private secretName = "";
  private vpcNetworkName = "";
  private subnetName = "";
  private firewallHttpName = "";
  private firewallSshName = "";
  private gatewayPort = 18789;

  /** Cached public IP */
  private cachedPublicIp = "";

  constructor(config: GceConfig);
  constructor(options: GceTargetOptions);
  constructor(configOrOptions: GceConfig | GceTargetOptions) {
    super();

    const isOptions = (arg: GceConfig | GceTargetOptions): arg is GceTargetOptions =>
      "config" in arg && typeof (arg as GceTargetOptions).config === "object";

    const config = isOptions(configOrOptions) ? configOrOptions.config : configOrOptions;
    const providedManagers = isOptions(configOrOptions) ? configOrOptions.managers : undefined;

    this.config = config;
    this.machineType = config.machineType ?? DEFAULT_MACHINE_TYPE;
    this.bootDiskSizeGb = config.bootDiskSizeGb ?? DEFAULT_BOOT_DISK_SIZE_GB;

    if (providedManagers) {
      this.operationManager = providedManagers.operationManager;
      this.networkManager = providedManagers.networkManager;
      this.computeManager = providedManagers.computeManager;

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
      this.secretManager = managers.secretManager!;
      this.loggingManager = managers.loggingManager!;
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
            gw.trustedProxies = ["172.16.0.0/12"]; // Docker bridge networks
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

  protected override sanitizeName(name: string, maxLength = 63): string {
    let sanitized = name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/^[^a-z]/, "a")
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
    this.templateName = `clawster-tmpl-${sanitized}`;
    this.migName = `clawster-mig-${sanitized}`;
    this.healthCheckName = `clawster-hc-${sanitized}`;
    this.secretName = `clawster-${sanitized}-config`;
    this.vpcNetworkName = this.config.vpcNetworkName ?? "clawster-vpc";
    this.subnetName = this.config.subnetName ?? "clawster-subnet";
    this.firewallHttpName = `clawster-fw-http-${sanitized}`;
    this.firewallSshName = `clawster-fw-ssh-${sanitized}`;
  }

  private get region(): string {
    const parts = this.config.zone.split("-");
    return parts.slice(0, -1).join("-");
  }

  // ── install ─────────────────────────────────────────────────────────

  async install(options: InstallOptions): Promise<InstallResult> {
    const profileName = options.profileName;
    this.gatewayPort = options.port;
    this.deriveResourceNames(profileName);

    this.log(`Starting GCE VM installation for ${profileName}`);
    this.log(`Zone: ${this.config.zone}, Machine type: ${this.machineType}`);

    try {
      // 1. Create VPC Network (shared, idempotent)
      this.log(`[1/7] Ensuring VPC network: ${this.vpcNetworkName}`);
      await this.networkManager.ensureVpcNetwork(this.vpcNetworkName, {
        description: "Clawster shared VPC",
      });
      this.log(`VPC network ready`);

      // 2. Create Subnet (shared, idempotent)
      this.log(`[2/7] Ensuring subnet: ${this.subnetName}`);
      await this.networkManager.ensureSubnet(this.vpcNetworkName, this.subnetName, "10.0.0.0/24");
      this.log(`Subnet ready`);

      // 3. Create Firewall rules
      // SECURITY: These MUST be separate GCE firewall resources.
      // A single resource with mixed sourceRanges would expose SSH to 0.0.0.0/0.
      this.log(`[3/7] Ensuring firewall rules`);
      await this.networkManager.ensureFirewall(this.firewallHttpName, this.vpcNetworkName, [
        {
          protocol: "tcp",
          ports: ["80", "443"],
          sourceRanges: ["0.0.0.0/0"],
          targetTags: ["clawster-vm"],
          description: "Allow HTTP/HTTPS traffic to Caddy",
        },
      ]);
      await this.networkManager.ensureFirewall(this.firewallSshName, this.vpcNetworkName, [
        {
          protocol: "tcp",
          ports: ["22"],
          sourceRanges: ["35.235.240.0/20"], // IAP range only
          targetTags: ["clawster-vm"],
          description: "Allow SSH via IAP only",
        },
      ]);
      this.log(`Firewall rules ready`);

      // 4. Create Secret Manager secret (empty initially, configure() fills it)
      this.log(`[4/7] Creating Secret Manager secret: ${this.secretName}`);
      await this.ensureSecret(this.secretName, "{}");
      this.log(`Secret Manager secret created`);

      // 5. Create Instance Template
      this.log(`[5/7] Creating instance template: ${this.templateName}`);
      const startupScript = this.buildStartupScript(options);
      const templateUrl = await this.createTemplate(options, startupScript);
      this.log(`Instance template ready`);

      // 6. Create Health Check
      this.log(`[6/7] Creating health check: ${this.healthCheckName}`);
      const healthCheckUrl = await this.computeManager.createHealthCheck(
        this.healthCheckName,
        80,
        "/health"
      );
      this.log(`Health check ready`);

      // 7. Create MIG
      this.log(`[7/7] Creating MIG: ${this.migName}`);
      await this.computeManager.createMig(this.migName, templateUrl, healthCheckUrl);
      this.log(`MIG created — VM will start provisioning`);

      this.log(`GCE VM installation complete!`);

      return {
        success: true,
        instanceId: this.instanceName,
        message: `GCE VM "${this.instanceName}" created (Caddy + MIG auto-healing) in ${this.config.zone}`,
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

  // ── configure ───────────────────────────────────────────────────────

  async configure(config: OpenClawConfigPayload): Promise<ConfigureResult> {
    const profileName = config.profileName;
    this.gatewayPort = config.gatewayPort;

    this.log(`Configuring GCE instance: ${profileName}`);

    if (!this.secretName) {
      this.deriveResourceNames(profileName);
    }

    const raw = this.transformConfig({ ...config.config } as Record<string, unknown>);
    const configData = JSON.stringify(raw, null, 2);

    try {
      this.log(`Storing configuration in Secret Manager: ${this.secretName}`);
      await this.ensureSecret(this.secretName, configData);
      this.log(`Secret Manager updated`);

      return {
        success: true,
        message: `Configuration stored in Secret Manager as "${this.secretName}". Restart to apply.`,
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

  // ── Lifecycle ───────────────────────────────────────────────────────

  async start(): Promise<void> {
    this.log(`Starting MIG: ${this.migName} (scaling to 1)`);
    await this.computeManager.scaleMig(this.migName, 1);
    this.log(`MIG scaled to 1 — VM will start`);
  }

  async stop(): Promise<void> {
    this.log(`Stopping MIG: ${this.migName} (scaling to 0)`);
    await this.computeManager.scaleMig(this.migName, 0);
    this.cachedPublicIp = "";
    this.log(`MIG scaled to 0 — VM will be deleted`);
  }

  async restart(): Promise<void> {
    this.log(`Restarting MIG instances: ${this.migName}`);
    await this.computeManager.recreateMigInstances(this.migName);
    this.cachedPublicIp = "";
    this.log(`MIG instances recreated — new VM will start`);
  }

  // ── getStatus ───────────────────────────────────────────────────────

  async getStatus(): Promise<TargetStatus> {
    try {
      const migStatus = await this.computeManager.getMigStatus(this.migName);

      let state: TargetStatus["state"];
      let error: string | undefined;

      switch (migStatus) {
        case "RUNNING":
          state = "running";
          break;
        case "STOPPED":
          state = "stopped";
          break;
        default:
          state = "running"; // Transitional (provisioning)
      }

      return { state, gatewayPort: this.gatewayPort, error };
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

  // ── getLogs ─────────────────────────────────────────────────────────

  async getLogs(options?: DeploymentLogOptions): Promise<string[]> {
    return this.loggingManager.getLogs(this.instanceName, this.config.zone, {
      since: options?.since,
      lines: options?.lines,
      filter: options?.filter,
    });
  }

  // ── getEndpoint ─────────────────────────────────────────────────────

  async getEndpoint(): Promise<GatewayEndpoint> {
    if (!this.cachedPublicIp) {
      this.cachedPublicIp = await this.computeManager.getMigInstanceIp(this.migName);
    }

    const host = this.config.customDomain ?? this.cachedPublicIp;

    if (!host) {
      throw new Error("No public IP available — VM may still be provisioning");
    }

    return {
      host,
      port: this.config.customDomain ? 443 : 80,
      protocol: this.config.customDomain ? "wss" : "ws",
    };
  }

  // ── destroy ─────────────────────────────────────────────────────────

  async destroy(): Promise<void> {
    this.log(`Destroying GCE resources for: ${this.instanceName}`);

    // 1. Delete MIG (deletes managed instances)
    this.log(`[1/7] Deleting MIG: ${this.migName}`);
    await this.computeManager.deleteMig(this.migName);
    this.log(`MIG deleted`);

    // 2. Delete health check
    this.log(`[2/7] Deleting health check: ${this.healthCheckName}`);
    await this.computeManager.deleteHealthCheck(this.healthCheckName);
    this.log(`Health check deleted`);

    // 3. Delete instance template
    this.log(`[3/7] Deleting instance template: ${this.templateName}`);
    await this.computeManager.deleteInstanceTemplate(this.templateName);
    this.log(`Instance template deleted`);

    // 4. Delete firewalls
    this.log(`[4/7] Deleting HTTP firewall: ${this.firewallHttpName}`);
    await this.networkManager.deleteFirewall(this.firewallHttpName);
    this.log(`HTTP firewall deleted`);

    this.log(`[5/7] Deleting SSH firewall: ${this.firewallSshName}`);
    await this.networkManager.deleteFirewall(this.firewallSshName);
    this.log(`SSH firewall deleted`);

    // 6. Delete secret
    this.log(`[6/7] Deleting secret: ${this.secretName}`);
    try {
      await this.secretManager.deleteSecret(this.secretName);
      this.log(`Secret deleted`);
    } catch {
      this.log(`Secret not found (skipped)`);
    }

    // 7. Clean up shared infrastructure if orphaned
    this.log(`[7/7] Checking shared infrastructure...`);
    try {
      await this.networkManager.deleteSharedInfraIfOrphaned(this.vpcNetworkName, this.subnetName);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(`Shared infra cleanup failed (non-fatal): ${errorMsg}`);
    }

    this.log(`GCE resources destroyed`);
  }

  // ── updateResources ─────────────────────────────────────────────────

  async updateResources(spec: ResourceSpec): Promise<ResourceUpdateResult> {
    this.log(`Starting resource update for: ${this.instanceName}`);

    try {
      const targetMachineType = this.specToMachineType(spec);
      this.log(`Target machine type: ${targetMachineType}`);

      // 1. Scale MIG to 0
      this.log(`[1/5] Scaling MIG to 0`);
      await this.computeManager.scaleMig(this.migName, 0);
      this.log(`MIG scaled to 0`);

      // 2. Get current template URL
      const oldTemplateUrl = await this.computeManager.getMigInstanceTemplate(this.migName);
      const oldTemplateName = oldTemplateUrl.split("/").pop() ?? "";

      // 3. Create new template with updated machine type
      const newTemplateName = `${this.templateName}-${Date.now()}`;
      this.log(`[2/5] Creating new template: ${newTemplateName}`);

      const startupScript = buildGceCaddyStartupScript({
        gatewayPort: this.gatewayPort,
        secretName: this.secretName,
        sysboxVersion: this.config.sysboxVersion ?? DEFAULT_SYSBOX_VERSION,
        caddyDomain: this.config.customDomain,
      });

      const templateConfig: InstanceTemplateConfig = {
        name: newTemplateName,
        machineType: targetMachineType,
        bootDiskSizeGb: this.bootDiskSizeGb,
        sourceImage: DEFAULT_SOURCE_IMAGE,
        networkName: this.vpcNetworkName,
        subnetName: this.subnetName,
        networkTags: ["clawster-vm"],
        startupScript,
        metadata: [
          { key: "clawster-secret-name", value: this.secretName },
          { key: "clawster-gateway-port", value: String(this.gatewayPort) },
        ],
        labels: {
          "clawster-managed": "true",
          "clawster-profile": this.sanitizeName(this.instanceName.replace("clawster-", "")),
        },
      };

      const newTemplateUrl = await this.computeManager.createInstanceTemplate(templateConfig);
      this.log(`New template created`);

      // 4. Update MIG to use new template
      this.log(`[3/5] Updating MIG template`);
      await this.computeManager.setMigInstanceTemplate(this.migName, newTemplateUrl);
      this.log(`MIG template updated`);

      // 5. Delete old template
      this.log(`[4/5] Deleting old template: ${oldTemplateName}`);
      await this.computeManager.deleteInstanceTemplate(oldTemplateName);
      this.log(`Old template deleted`);

      // 6. Scale MIG back to 1
      this.log(`[5/5] Scaling MIG to 1`);
      await this.computeManager.scaleMig(this.migName, 1);
      this.cachedPublicIp = "";
      this.log(`MIG scaled to 1`);

      this.machineType = targetMachineType;
      this.log(`Resource update complete!`);

      return {
        success: true,
        message: `GCE VM resources updated to ${targetMachineType}`,
        requiresRestart: true,
        estimatedDowntime: 180,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(`Resource update failed: ${errorMsg}`, "stderr");

      this.log(`Attempting to recover by scaling MIG to 1...`);
      try {
        await this.computeManager.scaleMig(this.migName, 1);
        this.log(`Recovery started`);
      } catch {
        this.log(`Recovery failed — manual intervention may be required`, "stderr");
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
    return this.machineTypeToSpec(this.machineType);
  }

  // ── Private helpers ─────────────────────────────────────────────────

  private async ensureSecret(name: string, value: string): Promise<void> {
    await this.secretManager.ensureSecret(name, value);
  }

  private buildStartupScript(options: InstallOptions): string {
    return buildGceCaddyStartupScript({
      gatewayPort: this.gatewayPort,
      secretName: this.secretName,
      sysboxVersion: this.config.sysboxVersion ?? DEFAULT_SYSBOX_VERSION,
      caddyDomain: this.config.customDomain,
      additionalEnv: options.containerEnv,
    });
  }

  private async createTemplate(
    options: InstallOptions,
    startupScript: string
  ): Promise<string> {
    const templateConfig: InstanceTemplateConfig = {
      name: this.templateName,
      machineType: this.machineType,
      bootDiskSizeGb: this.bootDiskSizeGb,
      sourceImage: DEFAULT_SOURCE_IMAGE,
      networkName: this.vpcNetworkName,
      subnetName: this.subnetName,
      networkTags: ["clawster-vm"],
      startupScript,
      metadata: [
        { key: "clawster-secret-name", value: this.secretName },
        { key: "clawster-gateway-port", value: String(this.gatewayPort) },
      ],
      labels: {
        "clawster-managed": "true",
        "clawster-profile": this.sanitizeName(options.profileName),
      },
    };

    return this.computeManager.createInstanceTemplate(templateConfig);
  }

  // ── Resource spec conversion ────────────────────────────────────────

  private specToMachineType(spec: ResourceSpec): string {
    for (const [, tierSpec] of Object.entries(GCE_TIER_SPECS)) {
      if (spec.cpu === tierSpec.cpu && spec.memory === tierSpec.memory) {
        return tierSpec.machineType ?? DEFAULT_MACHINE_TYPE;
      }
    }

    if (spec.memory >= 8192) return "e2-standard-2";
    if (spec.memory >= 4096 || spec.cpu >= 2048) return "e2-medium";
    return "e2-medium"; // Minimum — e2-small OOMs
  }

  private machineTypeToSpec(machineType: string): ResourceSpec {
    switch (machineType) {
      case "e2-medium":
        return { cpu: 2048, memory: 4096, dataDiskSizeGb: 0 };
      case "e2-standard-2":
        return { cpu: 2048, memory: 8192, dataDiskSizeGb: 0 };
      default:
        return { cpu: 2048, memory: 4096, dataDiskSizeGb: 0 };
    }
  }

  // ── getMetadata ─────────────────────────────────────────────────────

  getMetadata(): AdapterMetadata {
    return {
      type: DeploymentTargetType.GCE,
      displayName: "Google Compute Engine",
      icon: "gcp",
      description: "Run OpenClaw on GCE VM with Caddy reverse proxy and sandbox support",
      status: "ready",
      provisioningSteps: [
        { id: "validate_config", name: "Validate configuration" },
        { id: "security_audit", name: "Security audit" },
        { id: "create_vpc", name: "Create VPC network" },
        { id: "create_subnet", name: "Create subnet" },
        { id: "create_firewall", name: "Create firewall rules" },
        { id: "create_secret", name: "Create Secret Manager secret" },
        { id: "create_template", name: "Create instance template" },
        { id: "create_health_check", name: "Create health check" },
        { id: "create_mig", name: "Create managed instance group", estimatedDurationSec: 30 },
        { id: "install_docker", name: "Install Docker + Sysbox", estimatedDurationSec: 60 },
        { id: "install_caddy", name: "Install Caddy", estimatedDurationSec: 30 },
        { id: "start_openclaw", name: "Start OpenClaw container", estimatedDurationSec: 60 },
        { id: "wait_for_gateway", name: "Wait for Gateway", estimatedDurationSec: 30 },
        { id: "health_check", name: "Health check" },
      ],
      resourceUpdateSteps: [
        { id: "validate_resources", name: "Validate resource configuration" },
        { id: "scale_down", name: "Scale MIG to 0" },
        { id: "create_template", name: "Create new template", estimatedDurationSec: 10 },
        { id: "update_mig", name: "Update MIG template" },
        { id: "scale_up", name: "Scale MIG to 1", estimatedDurationSec: 180 },
        { id: "verify_completion", name: "Verify completion" },
      ],
      operationSteps: {
        install: "create_mig",
        start: "wait_for_gateway",
      },
      capabilities: {
        scaling: true,
        sandbox: true,
        persistentStorage: false, // Phase 1: no persistent disk
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
      tierSpecs: GCE_TIER_SPECS,
    };
  }
}
