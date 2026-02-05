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

// Deployment Targets
export { LocalMachineTarget } from "./targets/local/local-target";
export { DockerContainerTarget } from "./targets/docker/docker-target";
export { EcsEc2Target } from "./targets/ecs-ec2/ecs-ec2-target";
export type { EcsEc2Config } from "./targets/ecs-ec2/ecs-ec2-config";
export type { EcsEc2TargetOptions, EcsEc2Services } from "./targets/ecs-ec2/ecs-ec2-target";
export type {
  ICloudFormationService,
  IECSService,
  ISecretsManagerService,
  ICloudWatchLogsService,
  EcsServiceDescription,
  EcsDeployment,
  EcsServiceEvent,
  LogEventInfo,
} from "./targets/ecs-ec2/ecs-ec2-services.interface";
export { pushImageToEcr } from "./targets/ecs-ec2/ecr-push";
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
export { AzureVmTarget } from "./targets/azure-vm/azure-vm-target";
export type { AzureVmTargetOptions } from "./targets/azure-vm/azure-vm-target";
export type { AzureVmConfig } from "./targets/azure-vm/azure-vm-config";
export { AzureManagerFactory } from "./targets/azure-vm/azure-manager-factory";
export type { AzureManagerFactoryConfig, AzureManagers } from "./targets/azure-vm/azure-manager-factory";
export type {
  IAzureNetworkManager,
  IAzureComputeManager,
  IAzureAppGatewayManager,
} from "./targets/azure-vm/managers";
export type { EcrPushOptions, EcrPushResult } from "./targets/ecs-ec2/ecr-push";
export { generateProductionTemplate } from "./targets/ecs-ec2/templates/production";
export type { ProductionTemplateParams } from "./targets/ecs-ec2/templates/production";
export { generateSharedInfraTemplate } from "./targets/ecs-ec2/shared-infra/templates/shared-production";
export { generatePerBotTemplate } from "./targets/ecs-ec2/per-bot/per-bot-template";
export type { PerBotTemplateParams } from "./targets/ecs-ec2/per-bot/per-bot-template";
export type { SharedInfraOutputs } from "./targets/ecs-ec2/shared-infra/shared-infra-config";
export { SharedExportNames, getSharedInfraStackName, SHARED_INFRA_STACK_PREFIX } from "./targets/ecs-ec2/shared-infra/shared-infra-config";
export { ensureSharedInfra, getSharedInfraOutputs, isSharedInfraReady } from "./targets/ecs-ec2/shared-infra/shared-infra-manager";

// Factories
export { DeploymentTargetFactory } from "./targets/factory";

// Security Configuration
export * from "./security";

// Sysbox Capability Detection
export * from "./sysbox";