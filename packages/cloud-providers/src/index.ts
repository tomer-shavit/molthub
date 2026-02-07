// Constants
export * from "./constants";

// Base utilities
export * from "./base";

// Interfaces
export * from "./interface/deployment-target";
export * from "./interface/adapter-metadata";
export * from "./interface/resource-spec";

// Registry
export * from "./registry";

// Deployment Targets — AWS EC2
export { AwsEc2Target } from "./targets/ecs-ec2/aws-ec2-target";
export type { AwsEc2Config } from "./targets/ecs-ec2/aws-ec2-config";
export type { AwsEc2TargetOptions, AwsEc2Services } from "./targets/ecs-ec2/aws-ec2-services.interface";
export type {
  ISecretsManagerService as IAwsSecretsManagerService,
  ICloudWatchLogsService as IAwsCloudWatchLogsService,
} from "./targets/ecs-ec2/aws-ec2-services.interface";
export { AwsManagerFactory } from "./targets/ecs-ec2/aws-ec2-manager-factory";
export type { AwsManagerFactoryConfig, AwsEc2Managers } from "./targets/ecs-ec2/aws-ec2-manager-factory";
export type { IAwsNetworkManager, IAwsComputeManager } from "./targets/ecs-ec2/managers";
export type { SharedInfraIds, LaunchTemplateConfig } from "./targets/ecs-ec2/types";

// Deployment Targets — GCE
export { GceTarget } from "./targets/gce/gce-target";
export type { GceTargetOptions } from "./targets/gce/gce-target";
export type { GceConfig } from "./targets/gce/gce-config";
export { GceManagerFactory } from "./targets/gce/gce-manager-factory";
export type { GceManagerFactoryConfig, GceManagers } from "./targets/gce/gce-manager-factory";
export type {
  IGceOperationManager,
  IGceNetworkManager,
  IGceComputeManager,
  IGceLoadBalancerManager,
  IGceSecretManager,
  IGceLoggingManager,
  GceLogQueryOptions,
} from "./targets/gce/managers";
export {
  GceSecretManagerAdapter,
  GceLoggingManagerAdapter,
  GceDefaultSecretManager,
  GceDefaultLoggingManager,
} from "./targets/gce/managers";
export type {
  ISecretManagerService,
  ICloudLoggingService,
} from "./targets/gce/managers";

// Deployment Targets — Azure VM
export { AzureVmTarget } from "./targets/azure-vm/azure-vm-target";
export type { AzureVmTargetOptions } from "./targets/azure-vm/azure-vm-target";
export type { AzureVmConfig } from "./targets/azure-vm/azure-vm-config";
export { AzureManagerFactory } from "./targets/azure-vm/azure-manager-factory";
export type { AzureManagerFactoryConfig, AzureManagers } from "./targets/azure-vm/azure-manager-factory";
export type {
  IAzureNetworkManager,
  IAzureComputeManager,
} from "./targets/azure-vm/managers";

// Factories
export { DeploymentTargetFactory } from "./targets/factory";

// Middleware utilities
export * from "./middleware";

// Security Configuration
export * from "./security";

// Sysbox Capability Detection
export * from "./sysbox";