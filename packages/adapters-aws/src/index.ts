export { ECSService, ECSDeploymentConfig } from "./ecs/ecs-service";
export { SecretsManagerService, SecretValue } from "./secrets/secrets-service";
export { CloudWatchLogsService, LogEvent } from "./cloudwatch/cloudwatch-service";

export interface AWSConfig {
  region: string;
  accountId?: string;
  ecsExecutionRoleArn?: string;
  ecsTaskRoleArn?: string;
}