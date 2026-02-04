// ECS
export { ECSService, ECSDeploymentConfig } from "./ecs/ecs-service";

// Secrets Manager
export { SecretsManagerService, SecretValue } from "./secrets/secrets-service";
export { TokenRotationService, StaleSecret } from "./secrets/token-rotation.service";

// CloudWatch Logs
export { CloudWatchLogsService, LogEvent } from "./cloudwatch/cloudwatch-service";

// CloudFormation
export {
  CloudFormationService,
  CloudFormationCredentials,
  StackOutput,
  StackEventInfo,
  StackInfo,
  StackStatus,
} from "./cloudformation/cloudformation-service";

// ECR
export {
  ECRService,
  ECRCredentials,
  ECRAuthToken,
  ECRRepositoryInfo,
  ECRImageInfo,
} from "./ecr/ecr-service";

// EC2
export {
  EC2Service,
  EC2Credentials,
  EC2InstanceInfo,
  VpcInfo,
  SubnetInfo,
  SecurityGroupInfo,
  SecurityGroupRule,
  AvailabilityZoneInfo,
} from "./ec2/ec2-service";

// IAM
export {
  IAMService,
  IAMCredentials,
  RoleInfo,
  InstanceProfileInfo,
  AttachedPolicyInfo,
} from "./iam/iam-service";

// STS
export {
  STSService,
  STSCredentials,
  CallerIdentity,
  AssumedRoleCredentials,
  AssumeRoleResult,
} from "./sts/sts-service";

export interface AWSConfig {
  region: string;
  accountId?: string;
  ecsExecutionRoleArn?: string;
  ecsTaskRoleArn?: string;
}