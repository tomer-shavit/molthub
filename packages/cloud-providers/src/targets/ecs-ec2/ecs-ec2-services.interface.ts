/**
 * AWS Service interfaces for EcsEc2Target dependency injection.
 *
 * These interfaces define the contract for AWS services used by EcsEc2Target.
 * They are designed to match the APIs provided by @clawster/adapters-aws,
 * enabling proper dependency injection and testability.
 */

import type {
  StackInfo,
  StackEventInfo,
  StackStatus,
} from "@clawster/adapters-aws";

// Re-export types needed by consumers
export type { StackInfo, StackEventInfo, StackStatus };

/**
 * Interface for CloudFormation operations used by EcsEc2Target.
 * Matches the CloudFormationService API from @clawster/adapters-aws.
 */
export interface ICloudFormationService {
  /**
   * Create a new CloudFormation stack.
   */
  createStack(
    stackName: string,
    templateBody: string,
    options?: {
      parameters?: Record<string, string>;
      tags?: Record<string, string>;
      capabilities?: ("CAPABILITY_IAM" | "CAPABILITY_NAMED_IAM" | "CAPABILITY_AUTO_EXPAND")[];
    }
  ): Promise<string>;

  /**
   * Update an existing CloudFormation stack.
   */
  updateStack(
    stackName: string,
    templateBody: string,
    options?: {
      parameters?: Record<string, string>;
      tags?: Record<string, string>;
      capabilities?: ("CAPABILITY_IAM" | "CAPABILITY_NAMED_IAM" | "CAPABILITY_AUTO_EXPAND")[];
    }
  ): Promise<string>;

  /**
   * Delete a CloudFormation stack.
   * When retainResources is provided, those logical IDs are skipped during deletion
   * (useful for recovering from DELETE_FAILED state).
   */
  deleteStack(
    stackName: string,
    options?: { retainResources?: string[] }
  ): Promise<void>;

  /**
   * Describe a CloudFormation stack.
   * Returns undefined if the stack does not exist.
   */
  describeStack(stackName: string): Promise<StackInfo | undefined>;

  /**
   * Wait for a stack to reach a target status.
   */
  waitForStackStatus(
    stackName: string,
    targetStatus: StackStatus,
    options?: {
      pollIntervalMs?: number;
      timeoutMs?: number;
      onEvent?: (event: StackEventInfo) => void;
    }
  ): Promise<StackInfo>;

  /**
   * Get stack outputs as a key-value map.
   */
  getStackOutputs(stackName: string): Promise<Record<string, string>>;

  /**
   * Check if a stack exists and is not in a deleted state.
   */
  stackExists(stackName: string): Promise<boolean>;
}

/**
 * Interface for ECS operations used by EcsEc2Target.
 */
export interface IECSService {
  /**
   * Update an ECS service (desired count, force deployment, etc.).
   */
  updateService(
    cluster: string,
    service: string,
    options: {
      desiredCount?: number;
      forceNewDeployment?: boolean;
    }
  ): Promise<void>;

  /**
   * Describe an ECS service.
   */
  describeService(
    cluster: string,
    service: string
  ): Promise<EcsServiceDescription | undefined>;

  /**
   * List container instance ARNs in an ECS cluster.
   */
  listContainerInstances(cluster: string): Promise<string[]>;

  /**
   * Deregister a container instance from an ECS cluster.
   * Use force=true to deregister even if tasks are running.
   */
  deregisterContainerInstance(
    cluster: string,
    containerInstanceArn: string,
    force?: boolean
  ): Promise<void>;
}

/**
 * Description of an ECS service returned by describeService.
 */
export interface EcsServiceDescription {
  status: string;
  runningCount: number;
  desiredCount: number;
  deployments: EcsDeployment[];
  events: EcsServiceEvent[];
}

/**
 * ECS deployment information.
 */
export interface EcsDeployment {
  status: string;
  runningCount: number;
  desiredCount: number;
}

/**
 * ECS service event.
 */
export interface EcsServiceEvent {
  createdAt?: Date;
  message?: string;
}

/**
 * Interface for Secrets Manager operations used by EcsEc2Target.
 * Matches the SecretsManagerService API from @clawster/adapters-aws.
 */
export interface ISecretsManagerService {
  /**
   * Create a new secret.
   */
  createSecret(
    name: string,
    value: string,
    tags?: Record<string, string>
  ): Promise<string>;

  /**
   * Update an existing secret's value.
   */
  updateSecret(name: string, value: string): Promise<void>;

  /**
   * Delete a secret.
   */
  deleteSecret(name: string, forceDelete?: boolean): Promise<void>;

  /**
   * Check if a secret exists.
   */
  secretExists(name: string): Promise<boolean>;

  /**
   * Describe a secret to get its full ARN (includes random 6-char suffix).
   */
  describeSecret(secretId: string): Promise<{ arn: string }>;
}

/**
 * Interface for CloudWatch Logs operations used by EcsEc2Target.
 * Matches the CloudWatchLogsService API from @clawster/adapters-aws.
 */
export interface ICloudWatchLogsService {
  /**
   * Get log streams for a log group.
   */
  getLogStreams(logGroupName: string): Promise<string[]>;

  /**
   * Get logs from a log group.
   */
  getLogs(
    logGroupName: string,
    options?: {
      startTime?: Date;
      endTime?: Date;
      limit?: number;
      nextToken?: string;
    }
  ): Promise<{ events: LogEventInfo[]; nextToken?: string }>;

  /**
   * Delete a log group.
   */
  deleteLogGroup(logGroupName: string): Promise<void>;
}

/**
 * Log event information.
 */
export interface LogEventInfo {
  timestamp: Date;
  message: string;
}

/**
 * Interface for Auto Scaling operations used by EcsEc2Target.
 * Used during stack cleanup to remove orphaned scale-in protection.
 */
export interface IAutoScalingService {
  /**
   * Remove scale-in protection from all protected instances in an ASG.
   * No-op if the ASG doesn't exist or has no protected instances.
   */
  removeScaleInProtection(asgName: string): Promise<void>;
}

/**
 * Collection of AWS services required by EcsEc2Target.
 */
export interface EcsEc2Services {
  cloudFormation: ICloudFormationService;
  ecs: IECSService;
  secretsManager: ISecretsManagerService;
  cloudWatchLogs: ICloudWatchLogsService;
  /** Optional — only needed for DELETE_FAILED stack recovery. Created internally if not provided. */
  autoScaling?: IAutoScalingService;
}

/**
 * Options for constructing an EcsEc2Target with dependency injection support.
 */
export interface EcsEc2TargetOptions {
  /** ECS EC2 configuration */
  config: import("./ecs-ec2-config").EcsEc2Config;
  /** Optional services for dependency injection (useful for testing) */
  services?: EcsEc2Services;
}
