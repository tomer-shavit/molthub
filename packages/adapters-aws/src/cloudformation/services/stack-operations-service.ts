/**
 * Stack Operations Service
 *
 * Handles CloudFormation stack CRUD operations.
 * Part of SRP-compliant CloudFormation service split.
 */

import {
  CloudFormationClient,
  CreateStackCommand,
  UpdateStackCommand,
  DeleteStackCommand,
  DescribeStacksCommand,
  DescribeStackEventsCommand,
  Stack,
  StackEvent,
  Output,
  ListStacksCommand,
} from "@aws-sdk/client-cloudformation";
import { AwsErrorHandler } from "../../errors";

export interface StackInfo {
  stackId: string;
  stackName: string;
  status: string;
  statusReason?: string;
  creationTime: Date;
  lastUpdatedTime?: Date;
  outputs: StackOutput[];
}

export interface StackOutput {
  key: string;
  value: string;
  description?: string;
}

export interface StackEventInfo {
  eventId: string;
  resourceId: string;
  resourceType: string;
  resourceStatus: string;
  statusReason?: string;
  timestamp: Date;
}

export type StackStatus =
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
  | "UPDATE_ROLLBACK_FAILED";

export class StackOperationsService {
  constructor(private readonly client: CloudFormationClient) {}

  /**
   * Create a new CloudFormation stack.
   */
  async createStack(
    stackName: string,
    templateBody: string,
    options?: {
      parameters?: Record<string, string>;
      tags?: Record<string, string>;
      capabilities?: (
        | "CAPABILITY_IAM"
        | "CAPABILITY_NAMED_IAM"
        | "CAPABILITY_AUTO_EXPAND"
      )[];
    }
  ): Promise<string> {
    const parameters = options?.parameters
      ? Object.entries(options.parameters).map(([key, value]) => ({
          ParameterKey: key,
          ParameterValue: value,
        }))
      : undefined;

    const tags = options?.tags
      ? Object.entries(options.tags).map(([Key, Value]) => ({ Key, Value }))
      : undefined;

    const result = await this.client.send(
      new CreateStackCommand({
        StackName: stackName,
        TemplateBody: templateBody,
        Parameters: parameters,
        Tags: tags,
        Capabilities: options?.capabilities,
        OnFailure: "ROLLBACK",
        EnableTerminationProtection: false,
      })
    );

    return result.StackId ?? "";
  }

  /**
   * Update an existing CloudFormation stack.
   */
  async updateStack(
    stackName: string,
    templateBody: string,
    options?: {
      parameters?: Record<string, string>;
      tags?: Record<string, string>;
      capabilities?: (
        | "CAPABILITY_IAM"
        | "CAPABILITY_NAMED_IAM"
        | "CAPABILITY_AUTO_EXPAND"
      )[];
    }
  ): Promise<string> {
    const parameters = options?.parameters
      ? Object.entries(options.parameters).map(([key, value]) => ({
          ParameterKey: key,
          ParameterValue: value,
        }))
      : undefined;

    const tags = options?.tags
      ? Object.entries(options.tags).map(([Key, Value]) => ({ Key, Value }))
      : undefined;

    const result = await this.client.send(
      new UpdateStackCommand({
        StackName: stackName,
        TemplateBody: templateBody,
        Parameters: parameters,
        Tags: tags,
        Capabilities: options?.capabilities,
      })
    );

    return result.StackId ?? "";
  }

  /**
   * Delete a CloudFormation stack.
   * When retainResources is provided, those logical IDs are skipped during deletion
   * (useful for recovering from DELETE_FAILED state).
   */
  async deleteStack(
    stackName: string,
    options?: { retainResources?: string[]; force?: boolean }
  ): Promise<void> {
    await this.client.send(
      new DeleteStackCommand({
        StackName: stackName,
        RetainResources: options?.retainResources,
        DeletionMode: options?.force ? "FORCE_DELETE_STACK" : undefined,
      })
    );
  }

  /**
   * Describe a CloudFormation stack.
   * Returns undefined if the stack does not exist.
   */
  async describeStack(stackName: string): Promise<StackInfo | undefined> {
    try {
      const result = await this.client.send(
        new DescribeStacksCommand({
          StackName: stackName,
        })
      );

      const stack = result.Stacks?.[0];
      if (!stack) {
        return undefined;
      }

      return this.mapStackToInfo(stack);
    } catch (error) {
      if (
        AwsErrorHandler.isResourceNotFound(error) ||
        (error instanceof Error && error.message.includes("does not exist"))
      ) {
        return undefined;
      }
      throw error;
    }
  }

  /**
   * Get stack events for a CloudFormation stack.
   */
  async describeStackEvents(
    stackName: string,
    options?: {
      limit?: number;
      afterEventId?: string;
    }
  ): Promise<StackEventInfo[]> {
    const events: StackEventInfo[] = [];
    let nextToken: string | undefined;
    let found = false;

    do {
      const result = await this.client.send(
        new DescribeStackEventsCommand({
          StackName: stackName,
          NextToken: nextToken,
        })
      );

      for (const event of result.StackEvents ?? []) {
        if (options?.afterEventId && !found) {
          if (event.EventId === options.afterEventId) {
            found = true;
          }
          continue;
        }

        events.push(this.mapEventToInfo(event));

        if (options?.limit && events.length >= options.limit) {
          return events;
        }
      }

      nextToken = result.NextToken;
    } while (nextToken && (!options?.limit || events.length < options.limit));

    return events;
  }

  /**
   * Get stack outputs as a key-value map.
   */
  async getStackOutputs(stackName: string): Promise<Record<string, string>> {
    const stack = await this.describeStack(stackName);
    if (!stack) {
      throw new Error(`Stack "${stackName}" not found`);
    }

    const outputs: Record<string, string> = {};
    for (const output of stack.outputs) {
      outputs[output.key] = output.value;
    }
    return outputs;
  }

  /**
   * Check if a stack exists and is not in a deleted state.
   * Note: ROLLBACK_COMPLETE stacks ARE considered "existing" because they
   * block creation of a new stack with the same name. Callers must handle
   * ROLLBACK_COMPLETE by deleting the stack before re-creating.
   */
  async stackExists(stackName: string): Promise<boolean> {
    const stack = await this.describeStack(stackName);
    if (!stack) return false;
    return stack.status !== "DELETE_COMPLETE";
  }

  /**
   * List stacks filtered by status and optional name prefix.
   * Status filtering is server-side; prefix filtering is client-side
   * (ListStacks API does not support server-side name filtering).
   */
  async listStacks(options?: {
    statusFilter?: StackStatus[];
    namePrefix?: string;
  }): Promise<Array<{ stackName: string; status: string }>> {
    const results: Array<{ stackName: string; status: string }> = [];
    let nextToken: string | undefined;

    do {
      const response = await this.client.send(
        new ListStacksCommand({
          StackStatusFilter: options?.statusFilter,
          NextToken: nextToken,
        })
      );

      for (const summary of response.StackSummaries ?? []) {
        const name = summary.StackName ?? "";
        if (!options?.namePrefix || name.startsWith(options.namePrefix)) {
          results.push({
            stackName: name,
            status: summary.StackStatus ?? "",
          });
        }
      }

      nextToken = response.NextToken;
    } while (nextToken);

    return results;
  }

  private mapStackToInfo(stack: Stack): StackInfo {
    return {
      stackId: stack.StackId ?? "",
      stackName: stack.StackName ?? "",
      status: stack.StackStatus ?? "UNKNOWN",
      statusReason: stack.StackStatusReason,
      creationTime: stack.CreationTime ?? new Date(),
      lastUpdatedTime: stack.LastUpdatedTime,
      outputs: (stack.Outputs ?? []).map((o: Output) => ({
        key: o.OutputKey ?? "",
        value: o.OutputValue ?? "",
        description: o.Description,
      })),
    };
  }

  private mapEventToInfo(event: StackEvent): StackEventInfo {
    return {
      eventId: event.EventId ?? "",
      resourceId: event.LogicalResourceId ?? "",
      resourceType: event.ResourceType ?? "",
      resourceStatus: event.ResourceStatus ?? "",
      statusReason: event.ResourceStatusReason,
      timestamp: event.Timestamp ?? new Date(),
    };
  }
}
