/**
 * AWS Service Adapters — direct SDK implementations.
 *
 * Implements ISecretsManagerService and ICloudWatchLogsService using
 * @aws-sdk/client-secrets-manager and @aws-sdk/client-cloudwatch-logs directly.
 */

import {
  SecretsManagerClient,
  CreateSecretCommand,
  PutSecretValueCommand,
  DeleteSecretCommand,
  DescribeSecretCommand,
  ResourceNotFoundException,
} from "@aws-sdk/client-secrets-manager";

import {
  CloudWatchLogsClient,
  DescribeLogStreamsCommand,
  GetLogEventsCommand,
  DeleteLogGroupCommand,
  ResourceNotFoundException as LogsResourceNotFoundException,
} from "@aws-sdk/client-cloudwatch-logs";

import type {
  ISecretsManagerService,
  ICloudWatchLogsService,
  AwsEc2Services,
} from "./aws-ec2-services.interface";

export class SecretsManagerServiceAdapter implements ISecretsManagerService {
  constructor(private readonly client: SecretsManagerClient) {}

  async createSecret(name: string, value: string, tags?: Record<string, string>): Promise<string> {
    const result = await this.client.send(
      new CreateSecretCommand({
        Name: name,
        SecretString: value,
        Tags: tags
          ? Object.entries(tags).map(([Key, Value]) => ({ Key, Value }))
          : undefined,
      }),
    );
    if (!result.ARN) {
      throw new Error(`Failed to create secret "${name}": no ARN returned`);
    }
    return result.ARN;
  }

  async updateSecret(name: string, value: string): Promise<void> {
    await this.client.send(
      new PutSecretValueCommand({ SecretId: name, SecretString: value }),
    );
  }

  async deleteSecret(name: string, forceDelete?: boolean): Promise<void> {
    await this.client.send(
      new DeleteSecretCommand({
        SecretId: name,
        ForceDeleteWithoutRecovery: forceDelete,
      }),
    );
  }

  async secretExists(name: string): Promise<boolean> {
    try {
      await this.client.send(new DescribeSecretCommand({ SecretId: name }));
      return true;
    } catch (error) {
      if (error instanceof ResourceNotFoundException) return false;
      throw error;
    }
  }

}

export class CloudWatchLogsServiceAdapter implements ICloudWatchLogsService {
  constructor(private readonly client: CloudWatchLogsClient) {}

  async getLogStreams(logGroupName: string): Promise<string[]> {
    const result = await this.client.send(
      new DescribeLogStreamsCommand({ logGroupName }),
    );
    return (result.logStreams ?? []).map((s) => s.logStreamName!).filter(Boolean);
  }

  async getLogs(
    logGroupName: string,
    options?: { startTime?: Date; endTime?: Date; limit?: number; nextToken?: string },
  ): Promise<{ events: Array<{ timestamp: Date; message: string }>; nextToken?: string }> {
    const streams = await this.getLogStreams(logGroupName);
    if (streams.length === 0) {
      return { events: [] };
    }

    const result = await this.client.send(
      new GetLogEventsCommand({
        logGroupName,
        logStreamName: streams[0],
        startTime: options?.startTime?.getTime(),
        endTime: options?.endTime?.getTime(),
        limit: options?.limit,
        nextToken: options?.nextToken,
      }),
    );

    const events = (result.events ?? []).map((e) => ({
      timestamp: new Date(e.timestamp ?? 0),
      message: e.message ?? "",
    }));

    return { events, nextToken: result.nextForwardToken };
  }

  async deleteLogGroup(logGroupName: string): Promise<void> {
    try {
      await this.client.send(new DeleteLogGroupCommand({ logGroupName }));
    } catch (error) {
      if (error instanceof LogsResourceNotFoundException) return;
      throw error;
    }
  }
}

/**
 * Create the default AWS service adapters for production use.
 */
export function createDefaultServices(
  region: string,
  credentials: { accessKeyId: string; secretAccessKey: string },
): AwsEc2Services {
  const clientConfig = { region, credentials };
  return {
    secretsManager: new SecretsManagerServiceAdapter(
      new SecretsManagerClient(clientConfig),
    ),
    cloudWatchLogs: new CloudWatchLogsServiceAdapter(
      new CloudWatchLogsClient(clientConfig),
    ),
  };
}
