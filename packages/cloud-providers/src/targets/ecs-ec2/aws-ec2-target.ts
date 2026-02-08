/**
 * AWS EC2 Caddy-on-VM Deployment Target
 *
 * Architecture: Internet → SG (80/443) → EC2 → Caddy → 127.0.0.1:port → OpenClaw (Sysbox)
 * Auto-healing: ASG(max=1) replaces failed instances automatically.
 *
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
      // [1/5] Shared network infrastructure
      this.log("[1/5] Ensuring shared network infrastructure...");
      const infra = await this.networkManager.ensureSharedInfra();

      if (this.config.allowedCidr?.length) {
        await this.networkManager.updateSecurityGroupRules(
          infra.securityGroupId,
          this.config.allowedCidr.map((cidr) => ({ port: 22, cidr, description: "SSH" })),
        );
      }

      // [2/5] Secrets Manager secret
      this.log("[2/5] Creating Secrets Manager secret...");
      await this.ensureSecret(names.secretName, "{}");

      // [3/5] Resolve AMI + create Launch Template
      this.log("[3/5] Creating launch template...");
      const amiId = await this.computeManager.resolveUbuntuAmi();
      const userData = this.buildUserData(names.secretName, options.port, options.containerEnv);
      const ltId = await this.computeManager.ensureLaunchTemplate(names.launchTemplate, {
        instanceType: this.instanceType,
        bootDiskSizeGb: this.bootDiskSizeGb,
        amiId,
        securityGroupId: infra.securityGroupId,
        instanceProfileArn: infra.instanceProfileArn,
        userData: Buffer.from(userData).toString("base64"),
        tags: { "clawster:bot": name },
      });

      // [4/5] Create ASG (starts with desired=0)
      this.log("[4/5] Creating auto-scaling group...");
      await this.computeManager.ensureAsg(names.asg, ltId, infra.subnetId);

      // [5/5] Create CloudWatch log group (best effort)
      this.log("[5/5] Creating log group...");
      try {
        await this.cloudWatchLogs.getLogStreams(names.logGroup);
      } catch {
        this.log(`  Log group will be created on first write: ${names.logGroup}`);
      }

      this.log("Installation complete");
      return {
        success: true,
        instanceId: names.asg,
        message: `AWS EC2 target installed for ${name}`,
        serviceName: names.asg,
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
    const names = this.deriveNames(this.requireProfileName());
    this.log("Starting instance...");
    await this.computeManager.setAsgDesiredCapacity(names.asg, 1);

    await this.waitFor(
      async () => {
        const status = await this.computeManager.getAsgInstanceStatus(names.asg);
        return status === "running";
      },
      { timeoutMs: 600_000, intervalMs: 10_000, description: "instance to reach running state" },
    );

    this.cachedPublicIp = undefined;
    this.log("Instance started");
  }

  async stop(): Promise<void> {
    const names = this.deriveNames(this.requireProfileName());
    this.log("Stopping instance...");
    await this.computeManager.setAsgDesiredCapacity(names.asg, 0);
    this.cachedPublicIp = undefined;
    this.log("Instance stopped");
  }

  async restart(): Promise<void> {
    const names = this.deriveNames(this.requireProfileName());
    this.log("Recycling instance...");
    await this.computeManager.recycleAsgInstance(names.asg);
    this.cachedPublicIp = undefined;

    await this.waitFor(
      async () => {
        const status = await this.computeManager.getAsgInstanceStatus(names.asg);
        return status === "running";
      },
      { timeoutMs: 600_000, intervalMs: 10_000, description: "new instance to reach running state" },
    );
    this.log("Instance restarted");
  }

  async getStatus(): Promise<TargetStatus> {
    try {
      const names = this.deriveNames(this.requireProfileName());
      const status = await this.computeManager.getAsgInstanceStatus(names.asg);

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
      const names = this.deriveNames(this.requireProfileName());
      this.cachedPublicIp =
        (await this.computeManager.getAsgInstancePublicIp(names.asg)) ?? undefined;
    }

    if (!this.cachedPublicIp) {
      throw new Error("No public IP available — instance may not be running");
    }

    return { host: this.cachedPublicIp, port: 80, protocol: "ws" };
  }

  async destroy(): Promise<void> {
    const names = this.deriveNames(this.requireProfileName());

    this.log("[1/4] Deleting ASG...");
    await this.computeManager.deleteAsg(names.asg);

    this.log("[2/4] Deleting launch template...");
    await this.computeManager.deleteLaunchTemplate(names.launchTemplate);

    this.log("[3/4] Deleting secret...");
    try {
      await this.secretsManager.deleteSecret(names.secretName, true);
    } catch {
      this.log("  Secret already deleted");
    }

    this.log("[4/4] Deleting log group...");
    try {
      await this.cloudWatchLogs.deleteLogGroup(names.logGroup);
    } catch {
      this.log("  Log group already deleted");
    }

    this.cachedPublicIp = undefined;
    this.log("Destroy complete — shared infra preserved for reuse");
  }

  // ── SelfDescribingDeploymentTarget ───────────────────────────────────

  getMetadata(): AdapterMetadata {
    return {
      type: DeploymentTargetType.ECS_EC2,
      displayName: "AWS EC2",
      icon: "aws",
      description: "Caddy-on-VM with ASG auto-healing on AWS EC2",
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
        { id: "create_asg", name: "Create auto-scaling group", estimatedDurationSec: 5 },
        { id: "install_docker", name: "Install Docker + Sysbox", estimatedDurationSec: 60 },
        { id: "install_caddy", name: "Install Caddy", estimatedDurationSec: 30 },
        { id: "start_openclaw", name: "Start OpenClaw container", estimatedDurationSec: 60 },
        { id: "health_check", name: "Health check", estimatedDurationSec: 30 },
      ],
      resourceUpdateSteps: [
        { id: "validate_resources", name: "Validate resource spec" },
        { id: "scale_down", name: "Scale down ASG" },
        { id: "create_lt", name: "Create new launch template", estimatedDurationSec: 5 },
        { id: "scale_up", name: "Scale up ASG", estimatedDurationSec: 180 },
        { id: "verify_completion", name: "Verify instance running" },
      ],
      operationSteps: { install: "create_asg", start: "health_check" },
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
      asg: `clawster-asg-${sanitized}`,
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
    const exists = await this.secretsManager.secretExists(name);
    if (exists) {
      await this.secretsManager.updateSecret(name, value);
    } else {
      await this.secretsManager.createSecret(name, value, { "clawster:managed": "true" });
    }
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
