/**
 * Service Adapters for EcsEc2Target
 *
 * Adapts the concrete AWS service implementations from @clawster/adapters-aws
 * to the interface contracts defined in ecs-ec2-services.interface.ts.
 * Also provides internal SDK-based implementations for ECS and Auto Scaling
 * services that don't have dedicated adapter packages.
 *
 * This separation keeps the target class focused on deployment logic.
 */

import {
  createCloudFormationService,
  createSecretsManagerService,
  createCloudWatchLogsService,
  CloudFormationService,
  SecretsManagerService,
  CloudWatchLogsService,
} from "@clawster/adapters-aws";

import type {
  ICloudFormationService,
  IECSService,
  ISecretsManagerService,
  ICloudWatchLogsService,
  IAutoScalingService,
  IEC2Service,
  EcsEc2Services,
  EcsServiceDescription,
  StackEventInfo,
} from "./ecs-ec2-services.interface";

// ---------------------------------------------------------------------------
// Internal SDK-based services
// ---------------------------------------------------------------------------

/**
 * Internal ECS service wrapper that adapts the raw ECS SDK operations.
 * This provides the IECSService interface on top of direct SDK calls
 * for backward compatibility when no services are injected.
 */
export class InternalECSService implements IECSService {
  private readonly client: import("@aws-sdk/client-ecs").ECSClient;

  constructor(region: string, credentials: { accessKeyId: string; secretAccessKey: string }) {
    const { ECSClient } = require("@aws-sdk/client-ecs");
    this.client = new ECSClient({ region, credentials });
  }

  async updateService(
    cluster: string,
    service: string,
    options: { desiredCount?: number; forceNewDeployment?: boolean }
  ): Promise<void> {
    const { UpdateServiceCommand } = require("@aws-sdk/client-ecs");
    await this.client.send(
      new UpdateServiceCommand({
        cluster,
        service,
        desiredCount: options.desiredCount,
        forceNewDeployment: options.forceNewDeployment,
      })
    );
  }

  async describeService(
    cluster: string,
    service: string
  ): Promise<EcsServiceDescription | undefined> {
    const { DescribeServicesCommand } = require("@aws-sdk/client-ecs");
    const result = await this.client.send(
      new DescribeServicesCommand({
        cluster,
        services: [service],
      })
    ) as { services?: Array<{
      status?: string;
      runningCount?: number;
      desiredCount?: number;
      deployments?: Array<{ status?: string; runningCount?: number; desiredCount?: number }>;
      events?: Array<{ createdAt?: Date; message?: string }>;
    }> };

    const svc = result.services?.[0];
    if (!svc) {
      return undefined;
    }

    return {
      status: svc.status ?? "",
      runningCount: svc.runningCount ?? 0,
      desiredCount: svc.desiredCount ?? 0,
      deployments: (svc.deployments ?? []).map((d: { status?: string; runningCount?: number; desiredCount?: number }) => ({
        status: d.status ?? "",
        runningCount: d.runningCount ?? 0,
        desiredCount: d.desiredCount ?? 0,
      })),
      events: (svc.events ?? []).map((e: { createdAt?: Date; message?: string }) => ({
        createdAt: e.createdAt,
        message: e.message,
      })),
    };
  }

  async listContainerInstances(cluster: string): Promise<string[]> {
    const { ListContainerInstancesCommand } = require("@aws-sdk/client-ecs");
    const result = await this.client.send(
      new ListContainerInstancesCommand({ cluster })
    ) as { containerInstanceArns?: string[] };
    return result.containerInstanceArns ?? [];
  }

  async deregisterContainerInstance(
    cluster: string,
    containerInstanceArn: string,
    force = false
  ): Promise<void> {
    const { DeregisterContainerInstanceCommand } = require("@aws-sdk/client-ecs");
    await this.client.send(
      new DeregisterContainerInstanceCommand({
        cluster,
        containerInstance: containerInstanceArn,
        force,
      })
    );
  }
}

/**
 * Internal Auto Scaling service that provides the IAutoScalingService interface.
 * Handles ASG scale-in protection removal during stack cleanup.
 */
export class InternalAutoScalingService implements IAutoScalingService {
  private readonly region: string;
  private readonly credentials: { accessKeyId: string; secretAccessKey: string };

  constructor(region: string, credentials: { accessKeyId: string; secretAccessKey: string }) {
    this.region = region;
    this.credentials = credentials;
  }

  async removeScaleInProtection(asgName: string): Promise<void> {
    /* eslint-disable @typescript-eslint/no-var-requires */
    const {
      AutoScalingClient,
      DescribeAutoScalingGroupsCommand,
      SetInstanceProtectionCommand,
    } = require("@aws-sdk/client-auto-scaling");
    /* eslint-enable @typescript-eslint/no-var-requires */

    const asgClient = new AutoScalingClient({
      region: this.region,
      credentials: this.credentials,
    });

    const describeResult = await asgClient.send(
      new DescribeAutoScalingGroupsCommand({
        AutoScalingGroupNames: [asgName],
      })
    );

    const asg = describeResult.AutoScalingGroups?.[0] as
      | { Instances?: Array<{ ProtectedFromScaleIn?: boolean; InstanceId?: string }> }
      | undefined;

    if (!asg) return;

    const protectedInstances = (asg.Instances ?? [])
      .filter((i: { ProtectedFromScaleIn?: boolean }) => i.ProtectedFromScaleIn)
      .map((i: { InstanceId?: string }) => i.InstanceId)
      .filter(Boolean) as string[];

    if (protectedInstances.length === 0) return;

    await asgClient.send(
      new SetInstanceProtectionCommand({
        AutoScalingGroupName: asgName,
        InstanceIds: protectedInstances,
        ProtectedFromScaleIn: false,
      })
    );
  }
}

/**
 * Internal EC2 service for NAT instance termination protection removal.
 * Used only during shared infra cleanup.
 */
export class InternalEC2Service implements IEC2Service {
  private readonly region: string;
  private readonly credentials: { accessKeyId: string; secretAccessKey: string };

  constructor(region: string, credentials: { accessKeyId: string; secretAccessKey: string }) {
    this.region = region;
    this.credentials = credentials;
  }

  async disableTerminationProtection(instanceId: string): Promise<void> {
    const { EC2Client, ModifyInstanceAttributeCommand } = require("@aws-sdk/client-ec2");
    const client = new EC2Client({
      region: this.region,
      credentials: this.credentials,
    });
    await client.send(
      new ModifyInstanceAttributeCommand({
        InstanceId: instanceId,
        DisableApiTermination: { Value: false },
      })
    );
  }
}

// ---------------------------------------------------------------------------
// Adapter wrappers for @clawster/adapters-aws services
// ---------------------------------------------------------------------------

/**
 * Wrapper that adapts CloudFormationService to ICloudFormationService interface.
 */
export class CloudFormationServiceAdapter implements ICloudFormationService {
  constructor(private readonly service: CloudFormationService) {}

  async createStack(
    stackName: string,
    templateBody: string,
    options?: {
      parameters?: Record<string, string>;
      tags?: Record<string, string>;
      capabilities?: ("CAPABILITY_IAM" | "CAPABILITY_NAMED_IAM" | "CAPABILITY_AUTO_EXPAND")[];
    }
  ): Promise<string> {
    return this.service.createStack(stackName, templateBody, options);
  }

  async updateStack(
    stackName: string,
    templateBody: string,
    options?: {
      parameters?: Record<string, string>;
      tags?: Record<string, string>;
      capabilities?: ("CAPABILITY_IAM" | "CAPABILITY_NAMED_IAM" | "CAPABILITY_AUTO_EXPAND")[];
    }
  ): Promise<string> {
    return this.service.updateStack(stackName, templateBody, options);
  }

  async deleteStack(
    stackName: string,
    options?: { retainResources?: string[]; force?: boolean }
  ): Promise<void> {
    return this.service.deleteStack(stackName, options);
  }

  async describeStack(stackName: string) {
    return this.service.describeStack(stackName);
  }

  async waitForStackStatus(
    stackName: string,
    targetStatus: import("@clawster/adapters-aws").StackStatus,
    options?: {
      pollIntervalMs?: number;
      timeoutMs?: number;
      onEvent?: (event: StackEventInfo) => void;
    }
  ) {
    return this.service.waitForStackStatus(stackName, targetStatus, options);
  }

  async getStackOutputs(stackName: string): Promise<Record<string, string>> {
    return this.service.getStackOutputs(stackName);
  }

  async stackExists(stackName: string): Promise<boolean> {
    return this.service.stackExists(stackName);
  }

  async listStacks(options?: {
    statusFilter?: import("@clawster/adapters-aws").StackStatus[];
    namePrefix?: string;
  }): Promise<Array<{ stackName: string; status: string }>> {
    return this.service.listStacks(options);
  }
}

/**
 * Wrapper that adapts SecretsManagerService to ISecretsManagerService interface.
 */
export class SecretsManagerServiceAdapter implements ISecretsManagerService {
  constructor(private readonly service: SecretsManagerService) {}

  async createSecret(
    name: string,
    value: string,
    tags?: Record<string, string>
  ): Promise<string> {
    return this.service.createSecret(name, value, tags);
  }

  async updateSecret(name: string, value: string): Promise<void> {
    return this.service.updateSecret(name, value);
  }

  async deleteSecret(name: string, forceDelete?: boolean): Promise<void> {
    return this.service.deleteSecret(name, forceDelete);
  }

  async secretExists(name: string): Promise<boolean> {
    return this.service.secretExists(name);
  }

  async describeSecret(secretId: string): Promise<{ arn: string }> {
    return this.service.describeSecret(secretId);
  }
}

/**
 * Wrapper that adapts CloudWatchLogsService to ICloudWatchLogsService interface.
 */
export class CloudWatchLogsServiceAdapter implements ICloudWatchLogsService {
  constructor(private readonly service: CloudWatchLogsService) {}

  async getLogStreams(logGroupName: string): Promise<string[]> {
    return this.service.getLogStreams(logGroupName);
  }

  async getLogs(
    logGroupName: string,
    options?: {
      startTime?: Date;
      endTime?: Date;
      limit?: number;
      nextToken?: string;
    }
  ): Promise<{ events: Array<{ timestamp: Date; message: string }>; nextToken?: string }> {
    return this.service.getLogs(logGroupName, options);
  }

  async deleteLogGroup(logGroupName: string): Promise<void> {
    return this.service.deleteLogGroup(logGroupName);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create the default set of AWS service adapters for production use.
 */
export function createDefaultServices(
  region: string,
  credentials: { accessKeyId: string; secretAccessKey: string }
): EcsEc2Services {
  return {
    cloudFormation: new CloudFormationServiceAdapter(
      createCloudFormationService(region, credentials)
    ),
    ecs: new InternalECSService(region, credentials),
    secretsManager: new SecretsManagerServiceAdapter(
      createSecretsManagerService(region)
    ),
    cloudWatchLogs: new CloudWatchLogsServiceAdapter(
      createCloudWatchLogsService(region)
    ),
    autoScaling: new InternalAutoScalingService(region, credentials),
    ec2: new InternalEC2Service(region, credentials),
  };
}
