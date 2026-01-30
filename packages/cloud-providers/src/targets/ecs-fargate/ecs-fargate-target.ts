import { execFile } from "child_process";
import {
  DeploymentTarget,
  DeploymentTargetType,
  InstallOptions,
  InstallResult,
  MoltbotConfigPayload,
  ConfigureResult,
  TargetStatus,
  DeploymentLogOptions,
  GatewayEndpoint,
} from "../../interface/deployment-target";
import type { EcsFargateConfig } from "./ecs-fargate-config";

const DEFAULT_IMAGE = "ghcr.io/clawdbot/clawdbot:latest";
const DEFAULT_CLUSTER = "moltbot-cluster";
const DEFAULT_CPU = 256;
const DEFAULT_MEMORY = 512;

/**
 * Executes an AWS CLI command and returns stdout.
 * Credentials and region are injected via environment variables.
 */
function runAwsCommand(args: string[], config: EcsFargateConfig): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "aws",
      args,
      {
        timeout: 120_000,
        env: {
          ...process.env,
          AWS_ACCESS_KEY_ID: config.accessKeyId,
          AWS_SECRET_ACCESS_KEY: config.secretAccessKey,
          AWS_DEFAULT_REGION: config.region,
        },
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`AWS CLI failed: aws ${args.join(" ")}\n${stderr || error.message}`));
          return;
        }
        resolve(stdout.trim());
      },
    );
  });
}

/**
 * EcsFargateTarget manages a Moltbot gateway instance running
 * on AWS ECS Fargate (serverless containers).
 *
 * Uses the AWS CLI to manage task definitions, services, secrets,
 * and CloudWatch log groups. All commands include explicit region
 * and credential configuration.
 */
export class EcsFargateTarget implements DeploymentTarget {
  readonly type = DeploymentTargetType.ECS_FARGATE;

  private readonly config: EcsFargateConfig;
  private readonly clusterName: string;
  private readonly image: string;
  private readonly cpu: number;
  private readonly memory: number;
  private readonly assignPublicIp: boolean;

  /** Derived resource names — set during install */
  private serviceName = "";
  private taskFamily = "";
  private secretName = "";
  private logGroup = "";
  private gatewayPort = 18789;

  constructor(config: EcsFargateConfig) {
    this.config = config;
    this.clusterName = config.clusterName ?? DEFAULT_CLUSTER;
    this.image = config.image ?? DEFAULT_IMAGE;
    this.cpu = config.cpu ?? DEFAULT_CPU;
    this.memory = config.memory ?? DEFAULT_MEMORY;
    this.assignPublicIp = config.assignPublicIp ?? true;
  }

  // ------------------------------------------------------------------
  // install
  // ------------------------------------------------------------------

  async install(options: InstallOptions): Promise<InstallResult> {
    const profileName = options.profileName;
    this.gatewayPort = options.port;
    this.serviceName = `moltbot-${profileName}`;
    this.taskFamily = `moltbot-${profileName}`;
    this.secretName = `moltbot/${profileName}/config`;
    this.logGroup = `/ecs/moltbot-${profileName}`;

    const resolvedImage = options.moltbotVersion
      ? this.image.replace(/:.*$/, `:${options.moltbotVersion}`)
      : this.image;

    try {
      // 1. Create or verify the ECS cluster
      await runAwsCommand(
        [
          "ecs",
          "create-cluster",
          "--cluster-name",
          this.clusterName,
          "--region",
          this.config.region,
        ],
        this.config,
      );

      // 2. Create CloudWatch log group (ignore AlreadyExists)
      try {
        await runAwsCommand(
          [
            "logs",
            "create-log-group",
            "--log-group-name",
            this.logGroup,
            "--region",
            this.config.region,
          ],
          this.config,
        );
      } catch {
        // Log group may already exist — safe to ignore
      }

      // 3. Build container definition JSON
      const containerDef = [
        {
          name: "moltbot",
          image: resolvedImage,
          essential: true,
          portMappings: [
            {
              containerPort: this.gatewayPort,
              hostPort: this.gatewayPort,
              protocol: "tcp",
            },
          ],
          environment: [
            {
              name: "CLAWDBOT_CONFIG_PATH",
              value: "/tmp/moltbot-config.json",
            },
          ],
          logConfiguration: {
            logDriver: "awslogs",
            options: {
              "awslogs-group": this.logGroup,
              "awslogs-region": this.config.region,
              "awslogs-stream-prefix": "ecs",
            },
          },
        },
      ];

      // 4. Register Fargate task definition
      const registerArgs = [
        "ecs",
        "register-task-definition",
        "--family",
        this.taskFamily,
        "--network-mode",
        "awsvpc",
        "--requires-compatibilities",
        "FARGATE",
        "--cpu",
        String(this.cpu),
        "--memory",
        String(this.memory),
        "--container-definitions",
        JSON.stringify(containerDef),
        "--region",
        this.config.region,
      ];

      if (this.config.executionRoleArn) {
        registerArgs.push("--execution-role-arn", this.config.executionRoleArn);
      }
      if (this.config.taskRoleArn) {
        registerArgs.push("--task-role-arn", this.config.taskRoleArn);
      }

      await runAwsCommand(registerArgs, this.config);

      // 5. Create ECS service
      const networkConfig = {
        awsvpcConfiguration: {
          subnets: this.config.subnetIds,
          securityGroups: [this.config.securityGroupId],
          assignPublicIp: this.assignPublicIp ? "ENABLED" : "DISABLED",
        },
      };

      await runAwsCommand(
        [
          "ecs",
          "create-service",
          "--cluster",
          this.clusterName,
          "--service-name",
          this.serviceName,
          "--task-definition",
          this.taskFamily,
          "--desired-count",
          "1",
          "--launch-type",
          "FARGATE",
          "--network-configuration",
          JSON.stringify(networkConfig),
          "--region",
          this.config.region,
        ],
        this.config,
      );

      return {
        success: true,
        instanceId: this.serviceName,
        message: `ECS Fargate service "${this.serviceName}" created in cluster "${this.clusterName}"`,
        serviceName: this.serviceName,
      };
    } catch (error) {
      return {
        success: false,
        instanceId: this.serviceName,
        message: `ECS Fargate install failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // ------------------------------------------------------------------
  // configure
  // ------------------------------------------------------------------

  async configure(config: MoltbotConfigPayload): Promise<ConfigureResult> {
    const profileName = config.profileName;
    this.gatewayPort = config.gatewayPort;

    if (!this.secretName) {
      this.secretName = `moltbot/${profileName}/config`;
    }

    const configData = JSON.stringify(
      {
        profileName: config.profileName,
        gatewayPort: config.gatewayPort,
        environment: config.environment || {},
        ...config.config,
      },
      null,
      2,
    );

    try {
      // Attempt to create the secret first
      try {
        await runAwsCommand(
          [
            "secretsmanager",
            "create-secret",
            "--name",
            this.secretName,
            "--secret-string",
            configData,
            "--region",
            this.config.region,
          ],
          this.config,
        );
      } catch {
        // Secret may already exist — update it instead
        await runAwsCommand(
          [
            "secretsmanager",
            "update-secret",
            "--secret-id",
            this.secretName,
            "--secret-string",
            configData,
            "--region",
            this.config.region,
          ],
          this.config,
        );
      }

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
    await runAwsCommand(
      [
        "ecs",
        "update-service",
        "--cluster",
        this.clusterName,
        "--service",
        this.serviceName,
        "--desired-count",
        "1",
        "--region",
        this.config.region,
      ],
      this.config,
    );
  }

  // ------------------------------------------------------------------
  // stop
  // ------------------------------------------------------------------

  async stop(): Promise<void> {
    await runAwsCommand(
      [
        "ecs",
        "update-service",
        "--cluster",
        this.clusterName,
        "--service",
        this.serviceName,
        "--desired-count",
        "0",
        "--region",
        this.config.region,
      ],
      this.config,
    );
  }

  // ------------------------------------------------------------------
  // restart
  // ------------------------------------------------------------------

  async restart(): Promise<void> {
    await runAwsCommand(
      [
        "ecs",
        "update-service",
        "--cluster",
        this.clusterName,
        "--service",
        this.serviceName,
        "--force-new-deployment",
        "--region",
        this.config.region,
      ],
      this.config,
    );
  }

  // ------------------------------------------------------------------
  // getStatus
  // ------------------------------------------------------------------

  async getStatus(): Promise<TargetStatus> {
    try {
      const output = await runAwsCommand(
        [
          "ecs",
          "describe-services",
          "--cluster",
          this.clusterName,
          "--services",
          this.serviceName,
          "--region",
          this.config.region,
          "--output",
          "json",
        ],
        this.config,
      );

      const data = JSON.parse(output);
      const service = data.services?.[0];

      if (!service) {
        return { state: "not-installed" };
      }

      const runningCount: number = service.runningCount ?? 0;
      const desiredCount: number = service.desiredCount ?? 0;
      const serviceStatus: string = service.status ?? "";

      let state: TargetStatus["state"];
      if (runningCount > 0) {
        state = "running";
      } else if (desiredCount === 0) {
        state = "stopped";
      } else if (serviceStatus === "ACTIVE" && desiredCount > 0 && runningCount === 0) {
        // Desired > 0 but nothing running — likely an error or still starting
        state = "error";
      } else {
        state = "error";
      }

      return {
        state,
        gatewayPort: this.gatewayPort,
        error: state === "error" ? `Service status: ${serviceStatus}, running: ${runningCount}/${desiredCount}` : undefined,
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
      const args = [
        "logs",
        "get-log-events",
        "--log-group-name",
        this.logGroup,
        "--log-stream-name-prefix",
        "ecs/moltbot",
        "--region",
        this.config.region,
        "--output",
        "json",
      ];

      if (options?.lines) {
        args.push("--limit", String(options.lines));
      }

      if (options?.since) {
        args.push("--start-time", String(options.since.getTime()));
      }

      // First, find the latest log stream
      const streamsOutput = await runAwsCommand(
        [
          "logs",
          "describe-log-streams",
          "--log-group-name",
          this.logGroup,
          "--order-by",
          "LastEventTime",
          "--descending",
          "--limit",
          "1",
          "--region",
          this.config.region,
          "--output",
          "json",
        ],
        this.config,
      );

      const streamsData = JSON.parse(streamsOutput);
      const latestStream = streamsData.logStreams?.[0];

      if (!latestStream) {
        return [];
      }

      const eventsArgs = [
        "logs",
        "get-log-events",
        "--log-group-name",
        this.logGroup,
        "--log-stream-name",
        latestStream.logStreamName,
        "--region",
        this.config.region,
        "--output",
        "json",
      ];

      if (options?.lines) {
        eventsArgs.push("--limit", String(options.lines));
      }

      if (options?.since) {
        eventsArgs.push("--start-time", String(options.since.getTime()));
      }

      const eventsOutput = await runAwsCommand(eventsArgs, this.config);
      const eventsData = JSON.parse(eventsOutput);
      const events: Array<{ message: string }> = eventsData.events ?? [];

      let lines = events.map((e) => e.message).filter(Boolean);

      if (options?.filter) {
        const pattern = new RegExp(options.filter, "i");
        lines = lines.filter((line) => pattern.test(line));
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
    try {
      // 1. List tasks for the service
      const listOutput = await runAwsCommand(
        [
          "ecs",
          "list-tasks",
          "--cluster",
          this.clusterName,
          "--service-name",
          this.serviceName,
          "--desired-status",
          "RUNNING",
          "--region",
          this.config.region,
          "--output",
          "json",
        ],
        this.config,
      );

      const listData = JSON.parse(listOutput);
      const taskArns: string[] = listData.taskArns ?? [];

      if (taskArns.length === 0) {
        throw new Error("No running tasks found for service");
      }

      // 2. Describe the first task to get ENI attachment
      const describeOutput = await runAwsCommand(
        [
          "ecs",
          "describe-tasks",
          "--cluster",
          this.clusterName,
          "--tasks",
          taskArns[0],
          "--region",
          this.config.region,
          "--output",
          "json",
        ],
        this.config,
      );

      const describeData = JSON.parse(describeOutput);
      const task = describeData.tasks?.[0];

      if (!task) {
        throw new Error("Could not describe task");
      }

      // 3. Find the ENI attachment
      const eniAttachment = task.attachments?.find(
        (a: { type: string }) => a.type === "ElasticNetworkInterface",
      );
      const eniDetail = eniAttachment?.details?.find(
        (d: { name: string; value: string }) => d.name === "networkInterfaceId",
      );

      if (!eniDetail?.value) {
        throw new Error("No ENI found on task");
      }

      // 4. Get public IP from the ENI
      const eniOutput = await runAwsCommand(
        [
          "ec2",
          "describe-network-interfaces",
          "--network-interface-ids",
          eniDetail.value,
          "--region",
          this.config.region,
          "--output",
          "json",
        ],
        this.config,
      );

      const eniData = JSON.parse(eniOutput);
      const publicIp =
        eniData.NetworkInterfaces?.[0]?.Association?.PublicIp;

      if (!publicIp) {
        throw new Error("No public IP assigned to task ENI");
      }

      return {
        host: publicIp,
        port: this.gatewayPort,
        protocol: "ws",
      };
    } catch (error) {
      // Fallback: return a placeholder that callers can handle
      throw new Error(
        `Failed to resolve ECS Fargate endpoint: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // ------------------------------------------------------------------
  // destroy
  // ------------------------------------------------------------------

  async destroy(): Promise<void> {
    // 1. Delete the ECS service (force to drain running tasks)
    try {
      await runAwsCommand(
        [
          "ecs",
          "update-service",
          "--cluster",
          this.clusterName,
          "--service",
          this.serviceName,
          "--desired-count",
          "0",
          "--region",
          this.config.region,
        ],
        this.config,
      );

      await runAwsCommand(
        [
          "ecs",
          "delete-service",
          "--cluster",
          this.clusterName,
          "--service",
          this.serviceName,
          "--force",
          "--region",
          this.config.region,
        ],
        this.config,
      );
    } catch {
      // Service may not exist
    }

    // 2. Deregister the task definition
    try {
      // List task definition revisions
      const listOutput = await runAwsCommand(
        [
          "ecs",
          "list-task-definitions",
          "--family-prefix",
          this.taskFamily,
          "--region",
          this.config.region,
          "--output",
          "json",
        ],
        this.config,
      );

      const listData = JSON.parse(listOutput);
      const taskDefArns: string[] = listData.taskDefinitionArns ?? [];

      for (const arn of taskDefArns) {
        try {
          await runAwsCommand(
            [
              "ecs",
              "deregister-task-definition",
              "--task-definition",
              arn,
              "--region",
              this.config.region,
            ],
            this.config,
          );
        } catch {
          // Best-effort cleanup
        }
      }
    } catch {
      // Task definition may not exist
    }

    // 3. Delete the secret
    try {
      await runAwsCommand(
        [
          "secretsmanager",
          "delete-secret",
          "--secret-id",
          this.secretName,
          "--force-delete-without-recovery",
          "--region",
          this.config.region,
        ],
        this.config,
      );
    } catch {
      // Secret may not exist
    }

    // 4. Delete the CloudWatch log group
    try {
      await runAwsCommand(
        [
          "logs",
          "delete-log-group",
          "--log-group-name",
          this.logGroup,
          "--region",
          this.config.region,
        ],
        this.config,
      );
    } catch {
      // Log group may not exist
    }
  }
}
