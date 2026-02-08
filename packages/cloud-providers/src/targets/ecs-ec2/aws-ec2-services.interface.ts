/**
 * AWS Service interfaces for AwsEc2Target dependency injection.
 *
 * Simplified from the ECS-era interfaces — only SecretsManager and
 * CloudWatch Logs are needed for the Caddy-on-VM architecture.
 */

/**
 * Interface for Secrets Manager operations.
 * Matches the SecretsManagerService API from @clawster/adapters-aws.
 */
export interface ISecretsManagerService {
  createSecret(name: string, value: string, tags?: Record<string, string>): Promise<string>;
  updateSecret(name: string, value: string): Promise<void>;
  deleteSecret(name: string, forceDelete?: boolean): Promise<void>;
  restoreSecret(name: string): Promise<void>;
  secretExists(name: string): Promise<boolean>;
}

/**
 * Interface for CloudWatch Logs operations.
 * Matches the CloudWatchLogsService API from @clawster/adapters-aws.
 */
export interface ICloudWatchLogsService {
  getLogStreams(logGroupName: string): Promise<string[]>;
  getLogs(
    logGroupName: string,
    options?: { startTime?: Date; endTime?: Date; limit?: number; nextToken?: string },
  ): Promise<{ events: LogEventInfo[]; nextToken?: string }>;
  deleteLogGroup(logGroupName: string): Promise<void>;
}

/** Log event information */
export interface LogEventInfo {
  timestamp: Date;
  message: string;
}

/** Collection of AWS services required by AwsEc2Target */
export interface AwsEc2Services {
  secretsManager: ISecretsManagerService;
  cloudWatchLogs: ICloudWatchLogsService;
}

/** Options for constructing an AwsEc2Target with dependency injection */
export interface AwsEc2TargetOptions {
  config: import("./aws-ec2-config").AwsEc2Config;
  services?: AwsEc2Services;
  managers?: import("./aws-ec2-manager-factory").AwsEc2Managers;
}
