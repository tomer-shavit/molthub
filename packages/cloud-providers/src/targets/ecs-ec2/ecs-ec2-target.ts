/**
 * ECS EC2 Deployment Target
 *
 * Manages an OpenClaw gateway instance running on AWS ECS with EC2 launch type
 * via CloudFormation.
 *
 * SECURITY: All deployments use VPC + ALB architecture.
 * Containers are NEVER exposed directly to the internet.
 * External access (for webhooks from Telegram, WhatsApp, etc.) goes through ALB.
 *
 * Uses services from @clawster/adapters-aws for all cloud operations.
 * EC2 launch type enables Docker socket mounting for sandbox isolation.
 */

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
import { BaseDeploymentTarget } from "../../base/base-deployment-target";
import type { TransformOptions } from "../../base/config-transformer";
import type { AdapterMetadata, SelfDescribingDeploymentTarget } from "../../interface/adapter-metadata";
import type { ResourceSpec, ResourceUpdateResult, ResourceTier, TierSpec } from "../../interface/resource-spec";

/**
 * ECS EC2 tier specifications.
 */
const ECS_TIER_SPECS: Record<Exclude<ResourceTier, "custom">, TierSpec> = {
  light: {
    tier: "light",
    cpu: 512,
    memory: 1024,
    dataDiskSizeGb: 5,
    machineType: "t3.small",
  },
  standard: {
    tier: "standard",
    cpu: 1024,
    memory: 2048,
    dataDiskSizeGb: 10,
    machineType: "t3.medium",
  },
  performance: {
    tier: "performance",
    cpu: 2048,
    memory: 4096,
    dataDiskSizeGb: 20,
    machineType: "t3.large",
  },
};

/**
 * Determine the EC2 instance type that can accommodate the given memory.
 * Used for both initial install and resource updates.
 */
function getInstanceTypeForMemory(memoryMiB: number): string {
  if (memoryMiB <= 1024) return "t3.small";
  if (memoryMiB <= 2048) return "t3.medium";
  if (memoryMiB <= 4096) return "t3.large";
  return "t3.xlarge";
}
import type { EcsEc2Config } from "./ecs-ec2-config";
import type {
  ICloudFormationService,
  IECSService,
  ISecretsManagerService,
  ICloudWatchLogsService,
  IAutoScalingService,
  EcsEc2Services,
  EcsEc2TargetOptions,
  StackEventInfo,
} from "./ecs-ec2-services.interface";
import { StackCleanupService } from "./ecs-ec2-stack-cleanup";
import { createDefaultServices, InternalAutoScalingService } from "./ecs-ec2-service-adapters";
import { generateProductionTemplate } from "./templates/production";
import { generatePerBotTemplate } from "./per-bot/per-bot-template";
import { ensureSharedInfra } from "./shared-infra/shared-infra-manager";
import { VPC_CIDR } from "./shared-infra/shared-infra-config";

// Re-export for external use
export type { EcsEc2TargetOptions, EcsEc2Services };

const DEFAULT_CPU = 1024;
const DEFAULT_MEMORY = 2048;
const MAX_BOT_NAME_LENGTH = 20;
const MIN_BOT_NAME_LENGTH = 2;
const BOT_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
const OPENCLAW_VERSION_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9.\-]*$/;

/**
 * EcsEc2Target manages an OpenClaw gateway instance running
 * on AWS ECS with EC2 launch type via CloudFormation.
 *
 * SECURITY: All deployments use VPC + ALB architecture.
 * Containers are NEVER exposed directly to the internet.
 * External access (for webhooks from Telegram, WhatsApp, etc.) goes through ALB.
 *
 * Uses @clawster/adapters-aws services for all cloud operations.
 * EC2 launch type enables Docker socket mounting for sandbox isolation.
 */
export class EcsEc2Target extends BaseDeploymentTarget implements SelfDescribingDeploymentTarget {
  readonly type = DeploymentTargetType.ECS_EC2;

  private readonly config: EcsEc2Config;
  private readonly cpu: number;
  private readonly memory: number;
  private readonly instanceType: string;

  // Injected services (using interfaces for dependency inversion)
  private readonly cloudFormationService: ICloudFormationService;
  private readonly ecsService: IECSService;
  private readonly secretsManagerService: ISecretsManagerService;
  private readonly cloudWatchLogsService: ICloudWatchLogsService;
  private readonly autoScalingService: IAutoScalingService;

  /** Derived resource names — set during install */
  private stackName = "";
  private clusterName = "";
  private serviceName = "";
  private secretName = "";
  private logGroup = "";
  private gatewayPort = 18789;

  /**
   * Create an EcsEc2Target with just a config (backward compatible).
   * @param config - ECS EC2 configuration
   */
  constructor(config: EcsEc2Config);
  /**
   * Create an EcsEc2Target with options including optional services for DI.
   * @param options - Options including config and optional services
   */
  constructor(options: EcsEc2TargetOptions);
  constructor(configOrOptions: EcsEc2Config | EcsEc2TargetOptions) {
    super();

    // Determine if we received options or just config (backward compatibility)
    const isOptions = (arg: EcsEc2Config | EcsEc2TargetOptions): arg is EcsEc2TargetOptions =>
      "config" in arg && typeof (arg as EcsEc2TargetOptions).config === "object";

    const config = isOptions(configOrOptions) ? configOrOptions.config : configOrOptions;
    const providedServices = isOptions(configOrOptions) ? configOrOptions.services : undefined;

    this.config = config;
    this.cpu = config.cpu ?? DEFAULT_CPU;
    this.memory = config.memory ?? DEFAULT_MEMORY;
    this.instanceType = getInstanceTypeForMemory(this.memory);

    // Derive resource names from profileName (allows re-instantiated targets
    // to operate on existing resources without calling install() again)
    if (config.profileName) {
      const p = config.profileName;
      this.stackName = `clawster-bot-${p}`;
      this.clusterName = `clawster-${p}`;
      this.serviceName = `clawster-${p}`;
      this.secretName = `clawster/${p}/config`;
      this.logGroup = `/ecs/clawster-${p}`;
    }

    // Use provided services (for testing) or create via adapters-aws (production)
    const credentials = {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    };

    if (providedServices) {
      // Dependency injection path - use provided services
      this.cloudFormationService = providedServices.cloudFormation;
      this.ecsService = providedServices.ecs;
      this.secretsManagerService = providedServices.secretsManager;
      this.cloudWatchLogsService = providedServices.cloudWatchLogs;
      this.autoScalingService = providedServices.autoScaling
        ?? new InternalAutoScalingService(config.region, credentials);
    } else {
      // Factory path - create services from @clawster/adapters-aws
      const defaults = createDefaultServices(config.region, credentials);
      this.cloudFormationService = defaults.cloudFormation;
      this.ecsService = defaults.ecs;
      this.secretsManagerService = defaults.secretsManager;
      this.cloudWatchLogsService = defaults.cloudWatchLogs;
      this.autoScalingService = defaults.autoScaling
        ?? new InternalAutoScalingService(config.region, credentials);
    }
  }

  // ------------------------------------------------------------------
  // Config transformation
  // ------------------------------------------------------------------

  /**
   * ECS-specific config transformation options.
   * Sets gateway.mode, gateway.bind, and gateway.trustedProxies for ALB architecture.
   */
  protected override getTransformOptions(): TransformOptions {
    return {
      customTransforms: [
        (config) => {
          // ECS containers require specific gateway config for ALB architecture
          const existing = (config.gateway as Record<string, unknown>) ?? {};
          const { host: _h, port: _p, ...rest } = existing;
          const gw = {
            ...rest,
            // Required: gateway refuses to start without mode
            mode: "local",
            // Required: bind to 0.0.0.0 so ALB can reach the container
            bind: "lan",
            // Trust ALB proxy headers (VPC CIDR)
            trustedProxies: [VPC_CIDR],
          };
          return { ...config, gateway: gw };
        },
      ],
    };
  }

  // ------------------------------------------------------------------
  // install
  // ------------------------------------------------------------------

  async install(options: InstallOptions): Promise<InstallResult> {
    const profileName = options.profileName;

    // Validate bot name (ALB/TG names have 32-char max; with prefix/suffix we allow 20)
    if (profileName.length < MIN_BOT_NAME_LENGTH) {
      return {
        success: false,
        instanceId: "",
        message: `Bot name "${profileName}" must be at least ${MIN_BOT_NAME_LENGTH} characters`,
      };
    }
    if (profileName.length > MAX_BOT_NAME_LENGTH) {
      return {
        success: false,
        instanceId: "",
        message: `Bot name "${profileName}" exceeds ${MAX_BOT_NAME_LENGTH} characters (ALB name limit)`,
      };
    }
    if (!BOT_NAME_PATTERN.test(profileName)) {
      return {
        success: false,
        instanceId: "",
        message: `Bot name "${profileName}" must contain only lowercase alphanumeric characters and hyphens, and cannot start/end with a hyphen`,
      };
    }

    // Validate openclawVersion to prevent command injection in shell scripts
    if (this.config.openclawVersion && !OPENCLAW_VERSION_PATTERN.test(this.config.openclawVersion)) {
      return {
        success: false,
        instanceId: "",
        message: `Invalid openclawVersion "${this.config.openclawVersion}" — must be alphanumeric with dots and hyphens`,
      };
    }

    this.gatewayPort = options.port;
    this.stackName = `clawster-bot-${profileName}`;
    this.clusterName = `clawster-${profileName}`;
    this.serviceName = `clawster-${profileName}`;
    this.secretName = `clawster/${profileName}/config`;
    this.logGroup = `/ecs/clawster-${profileName}`;

    const useSharedInfra = this.config.useSharedInfra ?? true;

    try {
      this.log(`Starting ECS EC2 deployment for ${profileName}${useSharedInfra ? " (shared infra)" : " (legacy)"}`);

      // 1. Resolve image: use prebuild image name (built by UserData) or custom
      const imageUri = this.config.image ?? "openclaw-prebuilt:latest";
      const usePublicImage = !this.config.image;
      this.log(`Using container image: ${imageUri}`);

      // 2. Create the config secret and get its full ARN (includes random 6-char suffix)
      this.log("Creating Secrets Manager secret...");
      await this.ensureSecret(this.secretName, "{}");
      const secretInfo = await this.secretsManagerService.describeSecret(this.secretName);
      const openclawConfigSecretArn = secretInfo.arn;
      this.log("Secret created successfully");

      // 3. Generate CloudFormation template
      let template: Record<string, unknown>;

      if (useSharedInfra) {
        // Shared infra path: ensure shared stack exists, then create lightweight per-bot stack
        this.log("Ensuring shared infrastructure is ready...");
        await ensureSharedInfra(
          this.cloudFormationService,
          this.config.region,
          (msg, stream) => this.log(msg, stream),
        );

        this.log("Generating per-bot CloudFormation template (shared infra mode)...");
        template = generatePerBotTemplate({
          botName: profileName,
          gatewayPort: this.gatewayPort,
          imageUri,
          usePublicImage,
          cpu: this.cpu,
          memory: this.memory,
          instanceType: this.instanceType,
          gatewayAuthToken: options.gatewayAuthToken ?? "",
          containerEnv: options.containerEnv ?? {},
          allowedCidr: this.config.allowedCidr,
          certificateArn: this.config.certificateArn,
          openclawVersion: this.config.openclawVersion,
          openclawConfigSecretArn,
        });
      } else {
        // Legacy path: full self-contained stack
        this.log("Generating CloudFormation template (legacy full-stack mode)...");
        template = generateProductionTemplate({
          botName: profileName,
          gatewayPort: this.gatewayPort,
          imageUri,
          usePublicImage,
          cpu: this.cpu,
          memory: this.memory,
          gatewayAuthToken: options.gatewayAuthToken ?? "",
          containerEnv: options.containerEnv ?? {},
          allowedCidr: this.config.allowedCidr,
          certificateArn: this.config.certificateArn,
        });
      }

      // 4. Deploy CloudFormation stack (create or update if it already exists)
      let stackExists = await this.cloudFormationService.stackExists(this.stackName);

      // If the stack exists, check if it's in a transitional delete/rollback state
      if (stackExists) {
        const stackInfo = await this.cloudFormationService.describeStack(this.stackName);
        const status = stackInfo?.status ?? "";

        if (status === "DELETE_IN_PROGRESS") {
          this.log(`Stack ${this.stackName} is being deleted, waiting for completion...`);
          await this.waitForStack("DELETE_COMPLETE");
          stackExists = false;
        } else if (status === "DELETE_FAILED") {
          this.log(`Stack ${this.stackName} is in DELETE_FAILED state, force-deleting...`);
          await this.createStackCleanupService().forceDeleteStack();
          stackExists = false;
        } else if (
          status === "ROLLBACK_COMPLETE" ||
          status === "CREATE_FAILED" ||
          status === "UPDATE_FAILED" ||
          status === "UPDATE_ROLLBACK_FAILED"
        ) {
          this.log(`Stack ${this.stackName} is in ${status} state, deleting before re-creation...`);
          await this.cloudFormationService.deleteStack(this.stackName);
          await this.waitForStack("DELETE_COMPLETE");
          stackExists = false;
        }
      }

      if (stackExists) {
        this.log(`Stack ${this.stackName} exists, updating...`);
        try {
          await this.cloudFormationService.updateStack(
            this.stackName,
            JSON.stringify(template),
            { capabilities: ["CAPABILITY_NAMED_IAM"] }
          );
          await this.waitForStack("UPDATE_COMPLETE");
        } catch (error: unknown) {
          // "No updates are to be performed" is not an error
          if (
            error instanceof Error &&
            error.message.includes("No updates are to be performed")
          ) {
            this.log("Stack is already up-to-date, no changes needed");
          } else {
            throw error;
          }
        }
      } else {
        this.log(`Creating new CloudFormation stack: ${this.stackName}`);
        await this.cloudFormationService.createStack(
          this.stackName,
          JSON.stringify(template),
          {
            capabilities: ["CAPABILITY_NAMED_IAM"],
            tags: { "clawster:bot": profileName },
          }
        );
        await this.waitForStack("CREATE_COMPLETE");
      }

      // 5. Wait for ECS service to stabilize
      this.log("Waiting for ECS service to stabilize...");
      await this.waitForServiceStability();

      this.log("ECS EC2 deployment completed successfully");
      return {
        success: true,
        instanceId: this.serviceName,
        message: `ECS EC2 stack "${this.stackName}" created (${useSharedInfra ? "shared infra" : "full stack"}, VPC + ALB, secure)`,
        serviceName: this.serviceName,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(`ECS EC2 install failed: ${errorMsg}`, "stderr");
      return {
        success: false,
        instanceId: this.serviceName,
        message: `ECS EC2 install failed: ${errorMsg}`,
      };
    }
  }

  // ------------------------------------------------------------------
  // configure
  // ------------------------------------------------------------------

  async configure(config: OpenClawConfigPayload): Promise<ConfigureResult> {
    const profileName = config.profileName;
    this.gatewayPort = config.gatewayPort;

    if (!this.secretName) {
      this.secretName = `clawster/${profileName}/config`;
    }

    // Transform Clawster internal schema to valid OpenClaw config format
    // Uses shared transformer with ECS-specific overrides (gateway.bind = "lan")
    const transformed = this.transformConfig(config.config as Record<string, unknown>);

    // Store the transformed config as JSON — this will be injected as
    // the OPENCLAW_CONFIG env var and written to ~/.openclaw/openclaw.json
    // by the container startup command.
    const configData = JSON.stringify(transformed, null, 2);

    try {
      await this.ensureSecret(this.secretName, configData);

      return {
        success: true,
        message: `Configuration stored in Secrets Manager as "${this.secretName}"`,
        requiresRestart: true,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to store config: ${error instanceof Error ? error.message : String(error)}`,
        requiresRestart: false,
      };
    }
  }

  // ------------------------------------------------------------------
  // start
  // ------------------------------------------------------------------

  async start(): Promise<void> {
    this.log("Setting ECS service DesiredCount to 1...");
    await this.ecsService.updateService(this.clusterName, this.serviceName, {
      desiredCount: 1,
    });
    // Wait for the task to actually start running (capacity provider scales ASG + task placement)
    this.log("Waiting for ECS task to start...");
    await this.waitForServiceStability(600000); // 10 min — EC2 instance launch + task start
  }

  // ------------------------------------------------------------------
  // stop
  // ------------------------------------------------------------------

  async stop(): Promise<void> {
    await this.ecsService.updateService(this.clusterName, this.serviceName, {
      desiredCount: 0,
    });
  }

  // ------------------------------------------------------------------
  // restart
  // ------------------------------------------------------------------

  async restart(): Promise<void> {
    await this.ecsService.updateService(this.clusterName, this.serviceName, {
      forceNewDeployment: true,
    });
  }

  // ------------------------------------------------------------------
  // getStatus
  // ------------------------------------------------------------------

  async getStatus(): Promise<TargetStatus> {
    try {
      const service = await this.ecsService.describeService(
        this.clusterName,
        this.serviceName
      );

      if (!service) {
        return { state: "not-installed" };
      }

      const runningCount = service.runningCount;
      const desiredCount = service.desiredCount;
      const serviceStatus = service.status;

      let state: TargetStatus["state"];
      if (runningCount > 0) {
        state = "running";
      } else if (desiredCount === 0) {
        state = "stopped";
      } else if (serviceStatus === "ACTIVE" && desiredCount > 0) {
        state = "error";
      } else {
        state = "error";
      }

      return {
        state,
        gatewayPort: this.gatewayPort,
        error:
          state === "error"
            ? `Service status: ${serviceStatus}, running: ${runningCount}/${desiredCount}`
            : undefined,
      };
    } catch {
      return { state: "not-installed" };
    }
  }

  // ------------------------------------------------------------------
  // getLogs
  // ------------------------------------------------------------------

  async getLogs(options?: DeploymentLogOptions): Promise<string[]> {
    try {
      const streams = await this.cloudWatchLogsService.getLogStreams(this.logGroup);
      const latestStream = streams[0];
      if (!latestStream) {
        return [];
      }

      const result = await this.cloudWatchLogsService.getLogs(this.logGroup, {
        limit: options?.lines,
        startTime: options?.since,
      });

      let lines = result.events.map((e) => e.message).filter((m): m is string => Boolean(m));

      if (options?.filter) {
        try {
          const pattern = new RegExp(options.filter, "i");
          lines = lines.filter((line) => pattern.test(line));
        } catch {
          // If the filter is not a valid regex, use literal string match
          const literal = options.filter.toLowerCase();
          lines = lines.filter((line) => line.toLowerCase().includes(literal));
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
    // Always return the ALB DNS name (secure architecture)
    const outputs = await this.cloudFormationService.getStackOutputs(this.stackName);
    const albDns = outputs["AlbDnsName"];
    if (!albDns) {
      throw new Error("ALB DNS name not found in stack outputs");
    }
    return {
      host: albDns,
      port: this.config.certificateArn ? 443 : 80,
      protocol: this.config.certificateArn ? "wss" : "ws",
    };
  }

  // ------------------------------------------------------------------
  // destroy
  // ------------------------------------------------------------------

  async destroy(): Promise<void> {
    this.log(`Starting destruction of ECS EC2 resources for ${this.stackName}`);
    const cleanup = this.createStackCleanupService();

    // 1. Clean up resources that block CF deletion (best effort)
    try {
      await cleanup.cleanupStuckResources();
    } catch {
      // Best effort — proceed with deletion anyway
    }

    // 2. Delete CloudFormation stack (handles all CF-managed resources)
    try {
      this.log("Deleting CloudFormation stack...");
      await this.cloudFormationService.deleteStack(this.stackName);
      await this.waitForStack("DELETE_COMPLETE");
      this.log("CloudFormation stack deleted");
    } catch {
      // If delete failed, try the force-delete path.
      // Entire recovery block is wrapped so a failure here doesn't skip
      // secret / log-group cleanup in steps 3-4.
      try {
        const stackInfo = await this.cloudFormationService.describeStack(this.stackName);
        if (stackInfo && stackInfo.status === "DELETE_FAILED") {
          this.log("Stack deletion failed, attempting force-delete...");
          await cleanup.forceDeleteStack();
          this.log("CloudFormation stack force-deleted");
        } else if (!stackInfo || stackInfo.status === "DELETE_COMPLETE") {
          this.log("CloudFormation stack deleted");
        } else {
          this.log(`CloudFormation stack in ${stackInfo.status} state after deletion attempt`, "stderr");
        }
      } catch {
        this.log("CloudFormation stack could not be fully deleted", "stderr");
      }
    }

    // 3. Delete the Secrets Manager secret
    try {
      this.log("Deleting Secrets Manager secret...");
      await this.secretsManagerService.deleteSecret(this.secretName, true);
      this.log("Secret deleted");
    } catch {
      this.log("Secret not found or already deleted");
    }

    // 4. Delete the CloudWatch log group
    try {
      this.log("Deleting CloudWatch log group...");
      await this.cloudWatchLogsService.deleteLogGroup(this.logGroup);
      this.log("Log group deleted");
    } catch {
      this.log("Log group not found or already deleted");
    }

    this.log("ECS EC2 resource destruction completed");
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  /**
   * Create a StackCleanupService bound to this target's current state.
   * Used for DELETE_FAILED recovery in install() and destroy().
   */
  private createStackCleanupService(): StackCleanupService {
    return new StackCleanupService({
      cloudFormation: this.cloudFormationService,
      ecs: this.ecsService,
      autoScaling: this.autoScalingService,
      clusterName: this.clusterName,
      stackName: this.stackName,
      log: (msg, stream) => this.log(msg, stream),
      waitForStack: (targetStatus) => this.waitForStack(targetStatus),
    });
  }

  private async ensureSecret(name: string, value: string): Promise<void> {
    const exists = await this.secretsManagerService.secretExists(name);
    if (exists) {
      await this.secretsManagerService.updateSecret(name, value);
    } else {
      await this.secretsManagerService.createSecret(name, value);
    }
  }

  /**
   * Wait for a CloudFormation stack to reach a target status.
   * Logs stack events as they occur.
   */
  private async waitForStack(
    targetStatus: "CREATE_COMPLETE" | "UPDATE_COMPLETE" | "DELETE_COMPLETE"
  ): Promise<void> {
    const seenEventIds = new Set<string>();

    const onEvent = (event: StackEventInfo) => {
      if (seenEventIds.has(event.eventId)) return;
      seenEventIds.add(event.eventId);

      const resourceId = event.resourceId || "Unknown";
      const resourceStatus = event.resourceStatus || "UNKNOWN";
      const reason = event.statusReason;

      // Determine stream based on status
      const stream: "stdout" | "stderr" = resourceStatus.includes("FAILED")
        ? "stderr"
        : "stdout";

      // Format log message
      let message = `[${resourceId}] ${resourceStatus}`;
      if (reason) {
        message += ` - ${reason}`;
      }

      this.log(message, stream);
    };

    try {
      await this.cloudFormationService.waitForStackStatus(
        this.stackName,
        targetStatus,
        { onEvent }
      );
      this.log(`Stack reached target status: ${targetStatus}`);
    } catch (error: unknown) {
      // Handle DELETE_COMPLETE when stack doesn't exist
      if (
        targetStatus === "DELETE_COMPLETE" &&
        error instanceof Error &&
        error.message.includes("does not exist")
      ) {
        this.log("Stack deleted successfully");
        return;
      }
      throw error;
    }
  }

  /**
   * Wait for the ECS service to reach a stable state.
   * Polls the service and emits logs for deployment progress and events.
   */
  private async waitForServiceStability(timeoutMs: number = 300000): Promise<void> {
    const startTime = Date.now();
    let lastEventTime: Date | null = null;
    let lastRunningCount = -1;

    while (Date.now() - startTime < timeoutMs) {
      try {
        const service = await this.ecsService.describeService(
          this.clusterName,
          this.serviceName
        );

        if (!service) {
          this.log("Waiting for ECS service to be created...");
          await new Promise((resolve) => setTimeout(resolve, 10000));
          continue;
        }

        // Log new service events
        const events = service.events ?? [];
        const newEvents = events
          .filter((e) => !lastEventTime || (e.createdAt && e.createdAt > lastEventTime))
          .reverse();

        for (const event of newEvents) {
          if (event.message) {
            const stream: "stdout" | "stderr" =
              event.message.toLowerCase().includes("error") ||
              event.message.toLowerCase().includes("failed")
                ? "stderr"
                : "stdout";
            this.log(`[ECS] ${event.message}`, stream);
          }
          if (event.createdAt) {
            lastEventTime = event.createdAt;
          }
        }

        // Check deployment status
        const primary = service.deployments?.find((d) => d.status === "PRIMARY");
        if (primary) {
          const running = primary.runningCount ?? 0;
          const desired = primary.desiredCount ?? 0;

          // Service starts with DesiredCount:0 — nothing to wait for
          if (desired === 0 && running === 0) {
            this.log("[ECS] Service created with DesiredCount: 0 (tasks start later)");
            return;
          }

          // Only log if running count changed
          if (running !== lastRunningCount) {
            this.log(`[ECS] Deployment: ${running}/${desired} tasks running`);
            lastRunningCount = running;
          }

          // Check if stable: only one deployment and all tasks running
          if (
            service.deployments?.length === 1 &&
            running === desired &&
            running > 0
          ) {
            this.log("[ECS] Service is stable");
            return;
          }
        }
      } catch (error) {
        // Service may not exist yet during initial creation
        const msg = error instanceof Error ? error.message : String(error);
        if (!msg.includes("ServiceNotFoundException")) {
          this.log(`[ECS] Error checking service: ${msg}`, "stderr");
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 15000));
    }

    this.log(`[ECS] Service did not stabilize within ${timeoutMs / 1000}s`, "stderr");
  }

  // ------------------------------------------------------------------
  // updateResources
  // ------------------------------------------------------------------

  async updateResources(spec: ResourceSpec): Promise<ResourceUpdateResult> {
    try {
      this.log(`Starting resource update: CPU=${spec.cpu}, Memory=${spec.memory} MiB`);

      // ECS EC2 resource updates work by updating the CloudFormation stack
      // with new CPU/memory values. This triggers a rolling deployment.
      this.log("Generating updated CloudFormation template...");
      const useSharedInfra = this.config.useSharedInfra ?? true;
      const templateParams = {
        botName: this.config.profileName ?? "",
        gatewayPort: this.gatewayPort,
        imageUri: this.config.image ?? "node:22-slim",
        usePublicImage: !this.config.image,
        cpu: spec.cpu,
        memory: spec.memory,
        instanceType: getInstanceTypeForMemory(spec.memory),
        gatewayAuthToken: "",
        containerEnv: {},
        allowedCidr: this.config.allowedCidr,
        certificateArn: this.config.certificateArn,
      };
      const template = useSharedInfra
        ? generatePerBotTemplate(templateParams)
        : generateProductionTemplate(templateParams);

      try {
        this.log("Updating CloudFormation stack...");
        await this.cloudFormationService.updateStack(
          this.stackName,
          JSON.stringify(template),
          { capabilities: ["CAPABILITY_NAMED_IAM"] }
        );
        await this.waitForStack("UPDATE_COMPLETE");
      } catch (error: unknown) {
        if (
          error instanceof Error &&
          error.message.includes("No updates are to be performed")
        ) {
          this.log("Resources already at requested levels, no changes needed");
          return {
            success: true,
            message: "Resources already at requested levels",
            requiresRestart: false,
          };
        }
        throw error;
      }

      // Wait for ECS service to stabilize after the update
      this.log("Waiting for ECS service to stabilize after resource update...");
      await this.waitForServiceStability();

      this.log("Resource update completed successfully");
      return {
        success: true,
        message: `ECS task resources updated to ${spec.cpu} CPU units, ${spec.memory} MiB memory`,
        requiresRestart: false, // ECS handles rolling deployment automatically
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(`Failed to update resources: ${errorMsg}`, "stderr");
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
    // For ECS, we return the current CPU/memory configuration
    // These are stored in the class instance from the config
    return {
      cpu: this.cpu,
      memory: this.memory,
    };
  }

  // ------------------------------------------------------------------
  // getMetadata
  // ------------------------------------------------------------------

  /**
   * Return metadata describing this adapter's capabilities and provisioning steps.
   */
  getMetadata(): AdapterMetadata {
    return {
      type: DeploymentTargetType.ECS_EC2,
      displayName: "AWS ECS EC2",
      icon: "aws",
      description: "Run OpenClaw on AWS ECS with EC2 instances via CloudFormation",
      status: "ready",
      provisioningSteps: [
        { id: "validate_config", name: "Validate configuration" },
        { id: "security_audit", name: "Security audit" },
        { id: "create_stack", name: "Create CloudFormation stack", estimatedDurationSec: 300 },
        { id: "wait_stack_complete", name: "Wait for stack completion", estimatedDurationSec: 300 },
        { id: "configure_secrets", name: "Configure secrets" },
        { id: "wait_service_stable", name: "Wait for service stability", estimatedDurationSec: 120 },
        { id: "wait_for_gateway", name: "Wait for Gateway", estimatedDurationSec: 30 },
        { id: "health_check", name: "Health check" },
      ],
      resourceUpdateSteps: [
        { id: "validate_resources", name: "Validate resource configuration" },
        { id: "apply_changes", name: "Apply resource changes", estimatedDurationSec: 300 },
        { id: "verify_completion", name: "Verify completion" },
      ],
      operationSteps: {
        install: "create_stack",
        postInstall: "wait_stack_complete",
        configure: "configure_secrets",
        start: "wait_service_stable",
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
          key: "accessKeyId",
          displayName: "AWS Access Key ID",
          description: "IAM access key with ECS, CloudFormation, and Secrets Manager permissions",
          required: true,
          sensitive: false,
          pattern: "^AKIA[A-Z0-9]{16}$",
        },
        {
          key: "secretAccessKey",
          displayName: "AWS Secret Access Key",
          description: "Secret key for the IAM access key",
          required: true,
          sensitive: true,
        },
        {
          key: "region",
          displayName: "AWS Region",
          description: "AWS region for deployment (e.g., us-east-1)",
          required: true,
          sensitive: false,
        },
      ],
      tierSpecs: ECS_TIER_SPECS,
    };
  }
}
