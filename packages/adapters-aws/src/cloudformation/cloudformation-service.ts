/**
 * CloudFormation Service Facade
 *
 * Unified facade implementing IInfrastructureService by composing focused services.
 * Each focused service handles a single responsibility:
 * - StackOperationsService: CRUD + describe operations
 * - StackWaiterService: Polling with pluggable backoff strategy
 *
 * This design enables pluggable adapters for different cloud providers.
 */

import { CloudFormationClient } from "@aws-sdk/client-cloudformation";
import type {
  IInfrastructureService,
  StackConfig,
  StackInfo,
  StackOutput,
} from "@clawster/adapters-common";
import { StackOperationsService, type StackStatus } from "./services/stack-operations-service";
import {
  StackWaiterService,
  type WaitOptions,
} from "./services/stack-waiter-service";
import {
  BackoffStrategy,
  FixedDelayStrategy,
} from "./services/backoff-strategy";

// Re-export AWS-specific types
export type {
  StackEventInfo,
  StackStatus,
} from "./services/stack-operations-service";
export type { WaitOptions } from "./services/stack-waiter-service";
export {
  BackoffStrategy,
  FixedDelayStrategy,
  ExponentialBackoffStrategy,
  LinearBackoffStrategy,
} from "./services/backoff-strategy";

export interface CloudFormationCredentials {
  accessKeyId: string;
  secretAccessKey: string;
}

export interface CloudFormationServiceOptions {
  /** Default backoff strategy for wait operations */
  backoffStrategy?: BackoffStrategy;
}

/**
 * Convert template to string format for CloudFormation.
 * Accepts string (pass-through) or object (JSON serialize).
 */
function normalizeTemplate(template: string | object): string {
  if (typeof template === "string") {
    return template;
  }
  return JSON.stringify(template);
}

/**
 * Convert AWS-specific StackInfo to common interface format.
 */
function toCommonStackInfo(
  awsInfo: Awaited<
    ReturnType<StackOperationsService["describeStack"]>
  >
): StackInfo | undefined {
  if (!awsInfo) return undefined;
  return {
    stackId: awsInfo.stackId,
    stackName: awsInfo.stackName,
    status: awsInfo.status,
    statusReason: awsInfo.statusReason,
    creationTime: awsInfo.creationTime,
    lastUpdatedTime: awsInfo.lastUpdatedTime,
    outputs: awsInfo.outputs.map((o) => ({
      key: o.key,
      value: o.value,
      description: o.description,
    })),
  };
}

/**
 * AWS CloudFormation service implementing IInfrastructureService.
 * Composes focused services following Single Responsibility Principle.
 *
 * Pluggable design:
 * - Inject CloudFormationClient for testing/mocking
 * - Inject BackoffStrategy for customizable polling behavior
 * - Implements IInfrastructureService for cloud-agnostic usage
 */
export class CloudFormationService implements IInfrastructureService {
  private readonly operationsService: StackOperationsService;
  private readonly waiterService: StackWaiterService;

  constructor(
    client: CloudFormationClient,
    options: CloudFormationServiceOptions = {}
  ) {
    const backoffStrategy = options.backoffStrategy ?? new FixedDelayStrategy();

    this.operationsService = new StackOperationsService(client);
    this.waiterService = new StackWaiterService(
      this.operationsService,
      backoffStrategy
    );
  }

  // --- IStackOperations (from IInfrastructureService) ---

  async createStack(
    name: string,
    template: string | object,
    options?: StackConfig
  ): Promise<string> {
    return this.operationsService.createStack(
      name,
      normalizeTemplate(template),
      {
        parameters: options?.parameters,
        tags: options?.tags,
        capabilities: options?.capabilities as (
          | "CAPABILITY_IAM"
          | "CAPABILITY_NAMED_IAM"
          | "CAPABILITY_AUTO_EXPAND"
        )[],
      }
    );
  }

  async updateStack(
    name: string,
    template: string | object,
    options?: StackConfig
  ): Promise<string> {
    return this.operationsService.updateStack(
      name,
      normalizeTemplate(template),
      {
        parameters: options?.parameters,
        tags: options?.tags,
        capabilities: options?.capabilities as (
          | "CAPABILITY_IAM"
          | "CAPABILITY_NAMED_IAM"
          | "CAPABILITY_AUTO_EXPAND"
        )[],
      }
    );
  }

  async deleteStack(
    name: string,
    options?: { retainResources?: string[]; force?: boolean }
  ): Promise<void> {
    return this.operationsService.deleteStack(name, options);
  }

  async describeStack(name: string): Promise<StackInfo | undefined> {
    const awsInfo = await this.operationsService.describeStack(name);
    return toCommonStackInfo(awsInfo);
  }

  async stackExists(name: string): Promise<boolean> {
    return this.operationsService.stackExists(name);
  }

  // --- IStackOutputs (from IInfrastructureService) ---

  async getStackOutputs(name: string): Promise<Record<string, string>> {
    return this.operationsService.getStackOutputs(name);
  }

  // --- AWS-specific methods (not part of interface) ---

  /**
   * Get stack events for monitoring deployment progress.
   * AWS-specific method.
   */
  async describeStackEvents(
    stackName: string,
    options?: {
      limit?: number;
      afterEventId?: string;
    }
  ) {
    return this.operationsService.describeStackEvents(stackName, options);
  }

  /**
   * Wait for a stack to reach a target status.
   * AWS-specific method with pluggable backoff strategy.
   */
  async waitForStackStatus(
    stackName: string,
    targetStatus:
      | "CREATE_IN_PROGRESS"
      | "CREATE_COMPLETE"
      | "CREATE_FAILED"
      | "ROLLBACK_IN_PROGRESS"
      | "ROLLBACK_COMPLETE"
      | "ROLLBACK_FAILED"
      | "DELETE_IN_PROGRESS"
      | "DELETE_COMPLETE"
      | "DELETE_FAILED"
      | "UPDATE_IN_PROGRESS"
      | "UPDATE_COMPLETE"
      | "UPDATE_FAILED"
      | "UPDATE_ROLLBACK_IN_PROGRESS"
      | "UPDATE_ROLLBACK_COMPLETE"
      | "UPDATE_ROLLBACK_FAILED",
    options?: WaitOptions
  ) {
    return this.waiterService.waitForStackStatus(
      stackName,
      targetStatus,
      options
    );
  }

  /**
   * List stacks filtered by status and optional name prefix.
   */
  async listStacks(options?: {
    statusFilter?: StackStatus[];
    namePrefix?: string;
  }): Promise<Array<{ stackName: string; status: string }>> {
    return this.operationsService.listStacks(options);
  }
}

/**
 * Factory function to create a CloudFormationService.
 * Returns CloudFormationService for full AWS-specific functionality.
 *
 * Use as IInfrastructureService for cloud-agnostic code:
 *   const infra: IInfrastructureService = createCloudFormationService(region);
 *
 * Use as CloudFormationService for AWS-specific methods (waitForStackStatus, etc.):
 *   const cfn = createCloudFormationService(region);
 *   await cfn.waitForStackStatus(stackName, "CREATE_COMPLETE");
 */
export function createCloudFormationService(
  region: string = "us-east-1",
  credentials?: CloudFormationCredentials,
  options?: CloudFormationServiceOptions
): CloudFormationService {
  return new CloudFormationService(
    new CloudFormationClient({
      region,
      credentials: credentials
        ? {
            accessKeyId: credentials.accessKeyId,
            secretAccessKey: credentials.secretAccessKey,
          }
        : undefined,
    }),
    options
  );
}
