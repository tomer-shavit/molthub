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
} from "@aws-sdk/client-cloudformation";

export interface CloudFormationCredentials {
  accessKeyId: string;
  secretAccessKey: string;
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

export interface StackInfo {
  stackId: string;
  stackName: string;
  status: string;
  statusReason?: string;
  creationTime: Date;
  lastUpdatedTime?: Date;
  outputs: StackOutput[];
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

const DEFAULT_POLL_INTERVAL_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 600_000; // 10 minutes

export class CloudFormationService {
  private client: CloudFormationClient;

  constructor(region: string = "us-east-1", credentials?: CloudFormationCredentials) {
    this.client = new CloudFormationClient({
      region,
      credentials: credentials
        ? {
            accessKeyId: credentials.accessKeyId,
            secretAccessKey: credentials.secretAccessKey,
          }
        : undefined,
    });
  }

  /**
   * Create a new CloudFormation stack.
   */
  async createStack(
    stackName: string,
    templateBody: string,
    options?: {
      parameters?: Record<string, string>;
      tags?: Record<string, string>;
      capabilities?: ("CAPABILITY_IAM" | "CAPABILITY_NAMED_IAM" | "CAPABILITY_AUTO_EXPAND")[];
      onResourceCreated?: boolean;
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

    return result.StackId || "";
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
      capabilities?: ("CAPABILITY_IAM" | "CAPABILITY_NAMED_IAM" | "CAPABILITY_AUTO_EXPAND")[];
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

    return result.StackId || "";
  }

  /**
   * Delete a CloudFormation stack.
   */
  async deleteStack(stackName: string): Promise<void> {
    await this.client.send(
      new DeleteStackCommand({
        StackName: stackName,
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
      // Stack does not exist
      if (
        error instanceof Error &&
        error.message.includes("does not exist")
      ) {
        return undefined;
      }
      throw error;
    }
  }

  /**
   * Describe multiple CloudFormation stacks by name or pattern.
   */
  async describeStacks(stackNames?: string[]): Promise<StackInfo[]> {
    const stacks: StackInfo[] = [];
    let nextToken: string | undefined;

    do {
      const result = await this.client.send(
        new DescribeStacksCommand({
          NextToken: nextToken,
        })
      );

      for (const stack of result.Stacks ?? []) {
        if (!stackNames || stackNames.includes(stack.StackName || "")) {
          stacks.push(this.mapStackToInfo(stack));
        }
      }

      nextToken = result.NextToken;
    } while (nextToken);

    return stacks;
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
        // If afterEventId is specified, skip until we find it
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
   * Wait for a stack to reach a target status.
   */
  async waitForStackStatus(
    stackName: string,
    targetStatus: StackStatus,
    options?: {
      pollIntervalMs?: number;
      timeoutMs?: number;
      onEvent?: (event: StackEventInfo) => void;
    }
  ): Promise<StackInfo> {
    const pollInterval = options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const timeout = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const startTime = Date.now();
    const seenEventIds = new Set<string>();

    while (Date.now() - startTime < timeout) {
      // Poll stack events for progress updates
      if (options?.onEvent) {
        try {
          const events = await this.describeStackEvents(stackName);
          for (const event of events.reverse()) {
            if (!seenEventIds.has(event.eventId)) {
              seenEventIds.add(event.eventId);
              options.onEvent(event);
            }
          }
        } catch {
          // Events may not be available yet
        }
      }

      // Check stack status
      const stack = await this.describeStack(stackName);

      // Handle DELETE_COMPLETE - stack no longer exists
      if (targetStatus === "DELETE_COMPLETE" && !stack) {
        return {
          stackId: "",
          stackName,
          status: "DELETE_COMPLETE",
          creationTime: new Date(),
          outputs: [],
        };
      }

      if (!stack) {
        throw new Error(`Stack "${stackName}" not found`);
      }

      if (stack.status === targetStatus) {
        return stack;
      }

      // Check for terminal failure states
      if (
        stack.status.endsWith("_FAILED") ||
        stack.status === "ROLLBACK_COMPLETE" ||
        stack.status === "DELETE_FAILED"
      ) {
        throw new Error(
          `Stack "${stackName}" reached ${stack.status}: ${stack.statusReason || "Unknown error"}`
        );
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(
      `Stack "${stackName}" timed out waiting for ${targetStatus}`
    );
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
   */
  async stackExists(stackName: string): Promise<boolean> {
    const stack = await this.describeStack(stackName);
    if (!stack) return false;
    return stack.status !== "DELETE_COMPLETE" && stack.status !== "ROLLBACK_COMPLETE";
  }

  /**
   * Map AWS SDK Stack to StackInfo.
   */
  private mapStackToInfo(stack: Stack): StackInfo {
    return {
      stackId: stack.StackId || "",
      stackName: stack.StackName || "",
      status: stack.StackStatus || "UNKNOWN",
      statusReason: stack.StackStatusReason,
      creationTime: stack.CreationTime || new Date(),
      lastUpdatedTime: stack.LastUpdatedTime,
      outputs: (stack.Outputs ?? []).map((o: Output) => ({
        key: o.OutputKey || "",
        value: o.OutputValue || "",
        description: o.Description,
      })),
    };
  }

  /**
   * Map AWS SDK StackEvent to StackEventInfo.
   */
  private mapEventToInfo(event: StackEvent): StackEventInfo {
    return {
      eventId: event.EventId || "",
      resourceId: event.LogicalResourceId || "",
      resourceType: event.ResourceType || "",
      resourceStatus: event.ResourceStatus || "",
      statusReason: event.ResourceStatusReason,
      timestamp: event.Timestamp || new Date(),
    };
  }
}
