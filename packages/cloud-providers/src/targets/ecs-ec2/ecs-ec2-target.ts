import {
  CloudFormationClient,
  CreateStackCommand,
  UpdateStackCommand,
  DeleteStackCommand,
  DescribeStacksCommand,
  DescribeStackEventsCommand,
} from "@aws-sdk/client-cloudformation";
import {
  ECSClient,
  DescribeServicesCommand,
  UpdateServiceCommand,
} from "@aws-sdk/client-ecs";
import {
  SecretsManagerClient,
  CreateSecretCommand,
  UpdateSecretCommand,
  DeleteSecretCommand,
} from "@aws-sdk/client-secrets-manager";
import {
  CloudWatchLogsClient,
  DescribeLogStreamsCommand,
  GetLogEventsCommand,
  DeleteLogGroupCommand,
} from "@aws-sdk/client-cloudwatch-logs";
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
import type { EcsEc2Config } from "./ecs-ec2-config";
import { generateProductionTemplate } from "./templates/production";


const DEFAULT_CPU = 1024;
const DEFAULT_MEMORY = 2048;
const STACK_POLL_INTERVAL_MS = 10_000;
const STACK_TIMEOUT_MS = 600_000; // 10 minutes

/**
 * EcsEc2Target manages an OpenClaw gateway instance running
 * on AWS ECS with EC2 launch type via CloudFormation.
 *
 * SECURITY: All deployments use VPC + ALB architecture.
 * Containers are NEVER exposed directly to the internet.
 * External access (for webhooks from Telegram, WhatsApp, etc.) goes through ALB.
 *
 * Uses AWS SDK v3 for all cloud operations. EC2 launch type enables
 * Docker socket mounting for sandbox isolation.
 */
export class EcsEc2Target implements DeploymentTarget {
  readonly type = DeploymentTargetType.ECS_EC2;

  private readonly config: EcsEc2Config;
  private readonly cpu: number;
  private readonly memory: number;

  private readonly cfnClient: CloudFormationClient;
  private readonly ecsClient: ECSClient;
  private readonly smClient: SecretsManagerClient;
  private readonly cwlClient: CloudWatchLogsClient;

  /** Log callback for streaming progress to the UI */
  private onLog?: (line: string, stream: "stdout" | "stderr") => void;

  /** Derived resource names — set during install */
  private stackName = "";
  private clusterName = "";
  private serviceName = "";
  private secretName = "";
  private logGroup = "";
  private gatewayPort = 18789;

  constructor(config: EcsEc2Config) {
    this.config = config;
    this.cpu = config.cpu ?? DEFAULT_CPU;
    this.memory = config.memory ?? DEFAULT_MEMORY;

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

    const credentials = {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    };
    const region = config.region;

    this.cfnClient = new CloudFormationClient({ region, credentials });
    this.ecsClient = new ECSClient({ region, credentials });
    this.smClient = new SecretsManagerClient({ region, credentials });
    this.cwlClient = new CloudWatchLogsClient({ region, credentials });
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
  // install
  // ------------------------------------------------------------------

  async install(options: InstallOptions): Promise<InstallResult> {
    const profileName = options.profileName;
    this.gatewayPort = options.port;
    this.stackName = `clawster-bot-${profileName}`;
    this.clusterName = `clawster-${profileName}`;
    this.serviceName = `clawster-${profileName}`;
    this.secretName = `clawster/${profileName}/config`;
    this.logGroup = `/ecs/clawster-${profileName}`;

    try {
      this.log(`Starting ECS EC2 deployment for ${profileName}`);

      // 1. Resolve image: use public node:22-slim unless a custom image is provided
      const imageUri = this.config.image ?? "node:22-slim";
      const usePublicImage = !this.config.image;
      this.log(`Using container image: ${imageUri}`);

      // 2. Create the config secret in Secrets Manager (empty initially, configure() fills it)
      this.log("Creating Secrets Manager secret...");
      await this.ensureSecret(this.secretName, "{}");
      this.log("Secret created successfully");

      // 3. Generate CloudFormation template (always uses secure VPC + ALB architecture)
      this.log("Generating CloudFormation template...");
      const template = generateProductionTemplate({
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

      // 4. Deploy CloudFormation stack (create or update if it already exists)
      const stackExists = await this.stackExists();

      if (stackExists) {
        this.log(`Stack ${this.stackName} exists, updating...`);
        try {
          await this.cfnClient.send(
            new UpdateStackCommand({
              StackName: this.stackName,
              TemplateBody: JSON.stringify(template),
              Capabilities: ["CAPABILITY_NAMED_IAM"],
            }),
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
        await this.cfnClient.send(
          new CreateStackCommand({
            StackName: this.stackName,
            TemplateBody: JSON.stringify(template),
            Capabilities: ["CAPABILITY_NAMED_IAM"],
            Tags: [{ Key: "clawster:bot", Value: profileName }],
          }),
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
        message: `ECS EC2 stack "${this.stackName}" created (VPC + ALB, secure)`,
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

    // Apply the same config transformations as the Docker target
    // so that the openclaw.json written inside the container is valid.
    const raw = { ...config.config } as Record<string, unknown>;

    // gateway.bind = "lan" — ECS containers MUST bind to 0.0.0.0
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

    // channels.*.enabled is not valid — presence means active
    if (raw.channels && typeof raw.channels === "object") {
      for (const [key, value] of Object.entries(raw.channels as Record<string, unknown>)) {
        if (value && typeof value === "object" && "enabled" in (value as Record<string, unknown>)) {
          const { enabled: _enabled, ...rest } = value as Record<string, unknown>;
          (raw.channels as Record<string, unknown>)[key] = rest;
        }
      }
    }

    // Store the transformed config as JSON — this will be injected as
    // the OPENCLAW_CONFIG env var and written to ~/.openclaw/openclaw.json
    // by the container startup command.
    const configData = JSON.stringify(raw, null, 2);

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
    await this.ecsClient.send(
      new UpdateServiceCommand({
        cluster: this.clusterName,
        service: this.serviceName,
        desiredCount: 1,
      }),
    );
  }

  // ------------------------------------------------------------------
  // stop
  // ------------------------------------------------------------------

  async stop(): Promise<void> {
    await this.ecsClient.send(
      new UpdateServiceCommand({
        cluster: this.clusterName,
        service: this.serviceName,
        desiredCount: 0,
      }),
    );
  }

  // ------------------------------------------------------------------
  // restart
  // ------------------------------------------------------------------

  async restart(): Promise<void> {
    await this.ecsClient.send(
      new UpdateServiceCommand({
        cluster: this.clusterName,
        service: this.serviceName,
        forceNewDeployment: true,
      }),
    );
  }

  // ------------------------------------------------------------------
  // getStatus
  // ------------------------------------------------------------------

  async getStatus(): Promise<TargetStatus> {
    try {
      const result = await this.ecsClient.send(
        new DescribeServicesCommand({
          cluster: this.clusterName,
          services: [this.serviceName],
        }),
      );

      const service = result.services?.[0];
      if (!service) {
        return { state: "not-installed" };
      }

      const runningCount = service.runningCount ?? 0;
      const desiredCount = service.desiredCount ?? 0;
      const serviceStatus = service.status ?? "";

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
      const streamsResult = await this.cwlClient.send(
        new DescribeLogStreamsCommand({
          logGroupName: this.logGroup,
          orderBy: "LastEventTime",
          descending: true,
          limit: 1,
        }),
      );

      const latestStream = streamsResult.logStreams?.[0];
      if (!latestStream?.logStreamName) {
        return [];
      }

      const eventsResult = await this.cwlClient.send(
        new GetLogEventsCommand({
          logGroupName: this.logGroup,
          logStreamName: latestStream.logStreamName,
          limit: options?.lines,
          startTime: options?.since?.getTime(),
        }),
      );

      let lines = (eventsResult.events ?? [])
        .map((e) => e.message)
        .filter((m): m is string => Boolean(m));

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
    const outputs = await this.getStackOutputs();
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

    // 1. Delete CloudFormation stack (handles all CF-managed resources)
    try {
      this.log("Deleting CloudFormation stack...");
      await this.cfnClient.send(
        new DeleteStackCommand({ StackName: this.stackName }),
      );
      await this.waitForStack("DELETE_COMPLETE");
      this.log("CloudFormation stack deleted");
    } catch {
      this.log("CloudFormation stack not found or already deleted");
    }

    // 2. Delete the Secrets Manager secret
    try {
      this.log("Deleting Secrets Manager secret...");
      await this.smClient.send(
        new DeleteSecretCommand({
          SecretId: this.secretName,
          ForceDeleteWithoutRecovery: true,
        }),
      );
      this.log("Secret deleted");
    } catch {
      this.log("Secret not found or already deleted");
    }

    // 3. Delete the CloudWatch log group
    try {
      this.log("Deleting CloudWatch log group...");
      await this.cwlClient.send(
        new DeleteLogGroupCommand({ logGroupName: this.logGroup }),
      );
      this.log("Log group deleted");
    } catch {
      this.log("Log group not found or already deleted");
    }

    this.log("ECS EC2 resource destruction completed");
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  private async ensureSecret(name: string, value: string): Promise<void> {
    try {
      await this.smClient.send(
        new CreateSecretCommand({
          Name: name,
          SecretString: value,
        }),
      );
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.name === "ResourceExistsException"
      ) {
        await this.smClient.send(
          new UpdateSecretCommand({
            SecretId: name,
            SecretString: value,
          }),
        );
      } else {
        throw error;
      }
    }
  }

  private async stackExists(): Promise<boolean> {
    try {
      const result = await this.cfnClient.send(
        new DescribeStacksCommand({ StackName: this.stackName }),
      );
      const stack = result.Stacks?.[0];
      // A stack in DELETE_COMPLETE or ROLLBACK_COMPLETE is effectively gone
      if (!stack) return false;
      const status = stack.StackStatus;
      return status !== "DELETE_COMPLETE" && status !== "ROLLBACK_COMPLETE";
    } catch {
      return false;
    }
  }

  private async waitForStack(
    targetStatus: "CREATE_COMPLETE" | "UPDATE_COMPLETE" | "DELETE_COMPLETE",
  ): Promise<void> {
    const start = Date.now();
    const seenEventIds = new Set<string>();
    let lastLoggedStatus = "";

    while (Date.now() - start < STACK_TIMEOUT_MS) {
      try {
        // Poll stack events for detailed progress
        await this.pollStackEvents(seenEventIds);

        // Check overall stack status
        const result = await this.cfnClient.send(
          new DescribeStacksCommand({ StackName: this.stackName }),
        );

        const stack = result.Stacks?.[0];
        if (!stack) {
          if (targetStatus === "DELETE_COMPLETE") {
            this.log("Stack deleted successfully");
            return;
          }
          throw new Error(`Stack "${this.stackName}" not found`);
        }

        const status = stack.StackStatus ?? "UNKNOWN";

        // Log status changes
        if (status !== lastLoggedStatus) {
          this.log(`Stack status: ${status}`);
          lastLoggedStatus = status;
        }

        if (status === targetStatus) {
          this.log(`Stack reached target status: ${targetStatus}`);
          return;
        }

        if (
          status.endsWith("_FAILED") ||
          status === "ROLLBACK_COMPLETE" ||
          status === "DELETE_FAILED"
        ) {
          const reason = stack.StackStatusReason || "Unknown error";
          this.log(`Stack failed: ${status} - ${reason}`, "stderr");
          throw new Error(
            `Stack "${this.stackName}" reached ${status}: ${reason}`,
          );
        }
      } catch (error: unknown) {
        if (
          targetStatus === "DELETE_COMPLETE" &&
          error instanceof Error &&
          error.message.includes("does not exist")
        ) {
          this.log("Stack deleted successfully");
          return;
        }
        if (
          error instanceof Error &&
          (error.message.includes("_FAILED") ||
            error.message.includes("ROLLBACK"))
        ) {
          throw error;
        }
      }

      await new Promise((resolve) =>
        setTimeout(resolve, STACK_POLL_INTERVAL_MS),
      );
    }

    this.log(`Stack operation timed out after ${STACK_TIMEOUT_MS / 1000}s`, "stderr");
    throw new Error(
      `Stack "${this.stackName}" timed out waiting for ${targetStatus}`,
    );
  }

  /**
   * Poll CloudFormation stack events and emit logs for new events.
   * Events are deduplicated using seenEventIds set.
   */
  private async pollStackEvents(seenEventIds: Set<string>): Promise<void> {
    try {
      const result = await this.cfnClient.send(
        new DescribeStackEventsCommand({ StackName: this.stackName }),
      );

      // Events come in reverse chronological order, so reverse for oldest-first
      const events = (result.StackEvents ?? []).reverse();

      for (const event of events) {
        const eventId = event.EventId;
        if (!eventId || seenEventIds.has(eventId)) continue;
        seenEventIds.add(eventId);

        const resourceId = event.LogicalResourceId ?? "Unknown";
        const resourceStatus = event.ResourceStatus ?? "UNKNOWN";
        const reason = event.ResourceStatusReason;

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
      }
    } catch {
      // Stack may not exist yet or events unavailable - ignore
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
        const response = await this.ecsClient.send(
          new DescribeServicesCommand({
            cluster: this.clusterName,
            services: [this.serviceName],
          }),
        );

        const service = response.services?.[0];
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
            const stream: "stdout" | "stderr" = event.message.toLowerCase().includes("error") ||
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

  private async getStackOutputs(): Promise<Record<string, string>> {
    const result = await this.cfnClient.send(
      new DescribeStacksCommand({ StackName: this.stackName }),
    );

    const stack = result.Stacks?.[0];
    if (!stack) {
      throw new Error(`Stack "${this.stackName}" not found`);
    }

    const outputs: Record<string, string> = {};
    for (const output of stack.Outputs ?? []) {
      if (output.OutputKey && output.OutputValue) {
        outputs[output.OutputKey] = output.OutputValue;
      }
    }
    return outputs;
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
      const template = generateProductionTemplate({
        botName: this.config.profileName ?? "",
        gatewayPort: this.gatewayPort,
        imageUri: this.config.image ?? "node:22-slim",
        usePublicImage: !this.config.image,
        cpu: spec.cpu,
        memory: spec.memory,
        gatewayAuthToken: "",
        containerEnv: {},
        allowedCidr: this.config.allowedCidr,
        certificateArn: this.config.certificateArn,
      });

      try {
        this.log("Updating CloudFormation stack...");
        await this.cfnClient.send(
          new UpdateStackCommand({
            StackName: this.stackName,
            TemplateBody: JSON.stringify(template),
            Capabilities: ["CAPABILITY_NAMED_IAM"],
          }),
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
}
