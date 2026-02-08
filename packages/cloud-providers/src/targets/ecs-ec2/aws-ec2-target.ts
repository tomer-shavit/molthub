/**
 * AWS EC2 Caddy-on-VM Deployment Target
 *
 * Architecture: Internet -> SG (80/443) -> EC2 -> Caddy -> 127.0.0.1:port -> OpenClaw (Sysbox)
 *
 * Uses direct RunInstances/TerminateInstances with tag-based instance discovery.
 * Replaces the CloudFormation + ECS + ALB architecture with direct SDK calls.
 */

import { BaseDeploymentTarget, LogCallback } from "../../base/base-deployment-target";
import { buildAwsCaddyUserData } from "../../base/startup-script-builder";
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
import type {
  AdapterMetadata,
  SelfDescribingDeploymentTarget,
} from "../../interface/adapter-metadata";
import type { ResourceTier, TierSpec } from "../../interface/resource-spec";
import type { AwsEc2Config } from "./aws-ec2-config";
import type { AwsEc2TargetOptions } from "./aws-ec2-services.interface";
import type { ISecretsManagerService, ICloudWatchLogsService } from "./aws-ec2-services.interface";
import type { IAwsNetworkManager, IAwsComputeManager } from "./managers/interfaces";
import type { AwsEc2Managers } from "./aws-ec2-manager-factory";
import { AwsManagerFactory } from "./aws-ec2-manager-factory";
import { createDefaultServices } from "./aws-ec2-service-adapters";

const DEFAULT_GATEWAY_PORT = 18789;
const DEFAULT_INSTANCE_TYPE = "t3.small";
const DEFAULT_BOOT_DISK_GB = 20;

const AWS_TIER_SPECS: Record<Exclude<ResourceTier, "custom">, TierSpec> = {
  light: { tier: "light", cpu: 2048, memory: 2048, dataDiskSizeGb: 0, machineType: "t3.small" },
  standard: { tier: "standard", cpu: 2048, memory: 4096, dataDiskSizeGb: 0, machineType: "t3.medium" },
  performance: { tier: "performance", cpu: 2048, memory: 8192, dataDiskSizeGb: 0, machineType: "t3.large" },
};

export class AwsEc2Target
  extends BaseDeploymentTarget
  implements SelfDescribingDeploymentTarget
{
  readonly type = DeploymentTargetType.ECS_EC2;

  private readonly config: AwsEc2Config;
  private readonly instanceType: string;
  private readonly bootDiskSizeGb: number;

  private readonly networkManager: IAwsNetworkManager;
  private readonly computeManager: IAwsComputeManager;
  private readonly secretsManager: ISecretsManagerService;
  private readonly cloudWatchLogs: ICloudWatchLogsService;

  private profileName?: string;
  private cachedPublicIp?: string;

  constructor(config: AwsEc2Config);
  constructor(options: AwsEc2TargetOptions);
  constructor(configOrOptions: AwsEc2Config | AwsEc2TargetOptions) {
    super();

    const isOptions = "config" in configOrOptions && typeof configOrOptions.config === "object";
    this.config = isOptions
      ? (configOrOptions as AwsEc2TargetOptions).config
      : (configOrOptions as AwsEc2Config);

    this.instanceType = this.config.instanceType ?? DEFAULT_INSTANCE_TYPE;
    this.bootDiskSizeGb = this.config.bootDiskSizeGb ?? DEFAULT_BOOT_DISK_GB;

    if (this.config.profileName) {
      this.profileName = this.config.profileName;
    }

    // DI: Use injected managers/services or create defaults
    const options = isOptions ? (configOrOptions as AwsEc2TargetOptions) : undefined;
    const managers = options?.managers ?? this.createDefaultManagers();
    const services = options?.services ?? createDefaultServices(this.config.region, {
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
    });

    this.networkManager = managers.networkManager;
    this.computeManager = managers.computeManager;
    this.secretsManager = services.secretsManager;
    this.cloudWatchLogs = services.cloudWatchLogs;
  }

  // ── DeploymentTarget Implementation ──────────────────────────────────

  async install(options: InstallOptions): Promise<InstallResult> {
    const name = options.profileName;
    this.profileName = name;
    const names = this.deriveNames(name);

    try {
      // [1/4] Shared network infrastructure
      this.log("[1/4] Ensuring shared network infrastructure...");
      const infra = await this.networkManager.ensureSharedInfra();

      if (this.config.allowedCidr?.length) {
        await this.networkManager.updateSecurityGroupRules(
          infra.securityGroupId,
          this.config.allowedCidr.map((cidr) => ({ port: 22, cidr, description: "SSH" })),
        );
      }

      // [2/4] Secrets Manager secret
      this.log("[2/4] Creating Secrets Manager secret...");
      await this.ensureSecret(names.secretName, "{}");

      // [3/4] Resolve AMI + create Launch Template
      this.log("[3/4] Creating launch template...");
      const amiId = await this.computeManager.resolveUbuntuAmi();
      const userData = this.buildUserData(names.secretName, options.port, options.containerEnv);
      await this.computeManager.ensureLaunchTemplate(names.launchTemplate, {
        instanceType: this.instanceType,
        bootDiskSizeGb: this.bootDiskSizeGb,
        amiId,
        securityGroupId: infra.securityGroupId,
        instanceProfileArn: infra.instanceProfileArn,
        userData: Buffer.from(userData).toString("base64"),
        tags: { "clawster:bot": name },
      });

      // [4/4] Create CloudWatch log group (best effort)
      this.log("[4/4] Creating log group...");
      try {
        await this.cloudWatchLogs.getLogStreams(names.logGroup);
      } catch {
        this.log(`  Log group will be created on first write: ${names.logGroup}`);
      }

      this.log("Installation complete");
      return {
        success: true,
        instanceId: names.launchTemplate,
        message: `AWS EC2 target installed for ${name}`,
        serviceName: names.launchTemplate,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`Installation failed: ${message}`, "stderr");
      return { success: false, instanceId: "", message };
    }
  }

  async configure(config: OpenClawConfigPayload): Promise<ConfigureResult> {
    this.profileName = config.profileName;
    const names = this.deriveNames(config.profileName);

    const transformed = this.transformConfig(config.config ?? {});

    // AWS-specific: set gateway.bind=lan, mode=local, trustedProxies for Docker bridge
    // Keep gateway.port (OpenClaw needs it to know which port to listen on)
    // Valid gateway.mode: "local" (self-managed) or "remote" (cloud-managed)
    const gw = { ...((transformed.gateway as Record<string, unknown>) ?? {}) };
    gw.bind = "lan";
    gw.mode = gw.mode ?? "local";
    gw.trustedProxies = ["172.17.0.0/16"];
    delete gw.host;
    transformed.gateway = gw;

    const configJson = JSON.stringify(transformed, null, 2);

    await this.ensureSecret(names.secretName, configJson);
    this.log("Configuration stored in Secrets Manager");

    return {
      success: true,
      message: "Configuration updated — restart required to apply",
      requiresRestart: true,
    };
  }

  async start(): Promise<void> {
    const botName = this.requireProfileName();
    const names = this.deriveNames(botName);
    this.log("Starting instance...");

    // Guard: skip if already running/pending
    const existingId = await this.computeManager.findInstanceByTag(botName);
    if (existingId) {
      const status = await this.computeManager.getInstanceStatus(existingId);
      if (status === "running" || status === "pending") {
        this.log(`Instance already running: ${existingId}`);
        return;
      }
      // Terminate stopped/stopping instance before launching a new one
      await this.computeManager.terminateInstance(existingId);
    }

    const infra = await this.networkManager.getSharedInfra();
    if (!infra) {
      throw new Error("Shared infrastructure not found — run install() first");
    }

    const instanceId = await this.computeManager.runInstance(
      names.launchTemplate,
      infra.subnetId,
      botName,
    );

    await this.waitFor(
      async () => {
        const status = await this.computeManager.getInstanceStatus(instanceId);
        return status === "running";
      },
      { timeoutMs: 600_000, intervalMs: 10_000, description: "instance to reach running state" },
    );

    this.cachedPublicIp = undefined;
    this.log("Instance started");
  }

  async stop(): Promise<void> {
    const botName = this.requireProfileName();
    this.log("Stopping instance...");

    const instanceId = await this.computeManager.findInstanceByTag(botName);
    if (instanceId) {
      await this.computeManager.terminateInstance(instanceId);
    }

    this.cachedPublicIp = undefined;
    this.log("Instance stopped");
  }

  async restart(): Promise<void> {
    const botName = this.requireProfileName();
    const names = this.deriveNames(botName);
    this.log("Restarting instance...");

    // Terminate existing instance
    const existingId = await this.computeManager.findInstanceByTag(botName);
    if (existingId) {
      await this.computeManager.terminateInstance(existingId);
    }

    this.cachedPublicIp = undefined;

    // Launch new instance
    const infra = await this.networkManager.getSharedInfra();
    if (!infra) {
      throw new Error("Shared infrastructure not found — run install() first");
    }

    const instanceId = await this.computeManager.runInstance(
      names.launchTemplate,
      infra.subnetId,
      botName,
    );

    await this.waitFor(
      async () => {
        const status = await this.computeManager.getInstanceStatus(instanceId);
        return status === "running";
      },
      { timeoutMs: 600_000, intervalMs: 10_000, description: "new instance to reach running state" },
    );
    this.log("Instance restarted");
  }

  async getStatus(): Promise<TargetStatus> {
    try {
      const botName = this.requireProfileName();
      const instanceId = await this.computeManager.findInstanceByTag(botName);

      if (!instanceId) return { state: "stopped" };

      const status = await this.computeManager.getInstanceStatus(instanceId);

      if (status === "running" || status === "pending")
        return { state: "running", gatewayPort: DEFAULT_GATEWAY_PORT };

      return { state: "stopped" };
    } catch {
      return { state: "not-installed" };
    }
  }

  async getLogs(options?: DeploymentLogOptions): Promise<string[]> {
    const names = this.deriveNames(this.requireProfileName());
    try {
      const result = await this.cloudWatchLogs.getLogs(names.logGroup, {
        limit: options?.lines ?? 100,
        startTime: options?.since,
      });
      return result.events.map((e) => `[${e.timestamp.toISOString()}] ${e.message}`);
    } catch {
      return [];
    }
  }

  async getEndpoint(): Promise<GatewayEndpoint> {
    if (this.config.customDomain) {
      return { host: this.config.customDomain, port: 443, protocol: "wss" };
    }

    if (!this.cachedPublicIp) {
      const botName = this.requireProfileName();
      const instanceId = await this.computeManager.findInstanceByTag(botName);
      if (instanceId) {
        this.cachedPublicIp =
          (await this.computeManager.getInstancePublicIp(instanceId)) ?? undefined;
      }
    }

    if (!this.cachedPublicIp) {
      throw new Error("No public IP available — instance may not be running");
    }

    return { host: this.cachedPublicIp, port: 80, protocol: "ws" };
  }

  async destroy(): Promise<void> {
    const botName = this.requireProfileName();
    const names = this.deriveNames(botName);

    this.log("[1/5] Terminating instance...");
    const instanceId = await this.computeManager.findInstanceByTag(botName);
    if (instanceId) {
      await this.computeManager.terminateInstance(instanceId);
    }

    this.log("[2/5] Deleting launch template...");
    await this.computeManager.deleteLaunchTemplate(names.launchTemplate);

    this.log("[3/5] Deleting secret...");
    try {
      await this.secretsManager.deleteSecret(names.secretName, true);
    } catch {
      this.log("  Secret already deleted");
    }

    this.log("[4/5] Deleting log group...");
    try {
      await this.cloudWatchLogs.deleteLogGroup(names.logGroup);
    } catch {
      this.log("  Log group already deleted");
    }

    this.log("[5/5] Checking shared infrastructure...");
    try {
      await this.networkManager.deleteSharedInfraIfOrphaned();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.log(`  Shared infra cleanup failed (non-fatal): ${msg}`);
    }

    this.cachedPublicIp = undefined;
    this.log("Destroy complete");
  }

  // ── SelfDescribingDeploymentTarget ───────────────────────────────────

  getMetadata(): AdapterMetadata {
    return {
      type: DeploymentTargetType.ECS_EC2,
      displayName: "AWS EC2",
      icon: "aws",
      description: "Caddy-on-VM with direct EC2 instance management on AWS",
      status: "ready",
      provisioningSteps: [
        { id: "validate_config", name: "Validate configuration" },
        { id: "security_audit", name: "Security audit" },
        { id: "create_vpc", name: "Create VPC", estimatedDurationSec: 5 },
        { id: "create_subnet", name: "Create subnet", estimatedDurationSec: 3 },
        { id: "create_sg", name: "Create security group", estimatedDurationSec: 3 },
        { id: "create_iam", name: "Create IAM role", estimatedDurationSec: 5 },
        { id: "create_secret", name: "Create secret", estimatedDurationSec: 3 },
        { id: "resolve_ami", name: "Resolve Ubuntu AMI", estimatedDurationSec: 3 },
        { id: "create_lt", name: "Create launch template", estimatedDurationSec: 3 },
        { id: "launch_instance", name: "Launch EC2 instance", estimatedDurationSec: 5 },
        { id: "install_docker", name: "Install Docker + Sysbox", estimatedDurationSec: 60 },
        { id: "install_caddy", name: "Install Caddy", estimatedDurationSec: 30 },
        { id: "start_openclaw", name: "Start OpenClaw container", estimatedDurationSec: 60 },
        { id: "health_check", name: "Health check", estimatedDurationSec: 30 },
      ],
      resourceUpdateSteps: [
        { id: "validate_resources", name: "Validate resource spec" },
        { id: "terminate_instance", name: "Terminate instance" },
        { id: "create_lt", name: "Create new launch template", estimatedDurationSec: 5 },
        { id: "launch_instance", name: "Launch new instance", estimatedDurationSec: 180 },
        { id: "verify_completion", name: "Verify instance running" },
      ],
      operationSteps: { install: "create_lt", start: "health_check" },
      capabilities: {
        scaling: false,
        sandbox: true,
        persistentStorage: false,
        httpsEndpoint: true,
        logStreaming: true,
      },
      credentials: [
        {
          key: "region",
          displayName: "AWS Region",
          description: "AWS region for deployment (e.g. us-east-1)",
          required: true,
          sensitive: false,
        },
        {
          key: "accessKeyId",
          displayName: "AWS Access Key ID",
          description: "IAM access key for SDK authentication",
          required: true,
          sensitive: true,
        },
        {
          key: "secretAccessKey",
          displayName: "AWS Secret Access Key",
          description: "IAM secret key for SDK authentication",
          required: true,
          sensitive: true,
        },
      ],
      tierSpecs: AWS_TIER_SPECS,
    };
  }

  // ── Private Helpers ──────────────────────────────────────────────────

  private deriveNames(profileName: string) {
    const sanitized = this.sanitizeName(profileName);
    return {
      launchTemplate: `clawster-lt-${sanitized}`,
      secretName: `clawster/${sanitized}/config`,
      logGroup: `/clawster/${sanitized}`,
    };
  }

  private requireProfileName(): string {
    if (!this.profileName) {
      throw new Error("profileName not set — call install() or configure() first");
    }
    return this.profileName;
  }

  private buildUserData(secretName: string, port: number, additionalEnv?: Record<string, string>): string {
    return buildAwsCaddyUserData({
      gatewayPort: port,
      secretName,
      region: this.config.region,
      sysboxVersion: this.config.sysboxVersion,
      customDomain: this.config.customDomain,
      additionalEnv,
    });
  }

  private async ensureSecret(name: string, value: string): Promise<void> {
    try {
      const exists = await this.secretsManager.secretExists(name);
      if (exists) {
        await this.secretsManager.updateSecret(name, value);
      } else {
        await this.secretsManager.createSecret(name, value, { "clawster:managed": "true" });
      }
    } catch (error) {
      if (this.isMarkedForDeletionError(error)) {
        this.log("Secret is pending deletion — restoring and updating");
        await this.secretsManager.restoreSecret(name);
        await this.secretsManager.updateSecret(name, value);
      } else {
        throw error;
      }
    }
  }

  private isMarkedForDeletionError(error: unknown): boolean {
    if (error instanceof Error && "name" in error) {
      return (error as { name: string }).name === "InvalidRequestException"
        && error.message.includes("marked for deletion");
    }
    return false;
  }

  private createDefaultManagers(): AwsEc2Managers {
    const log: LogCallback = (line, stream) => this.log(line, stream);
    return AwsManagerFactory.createManagers({
      region: this.config.region,
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
      log: (line) => log(line, "stdout"),
    });
  }
}
