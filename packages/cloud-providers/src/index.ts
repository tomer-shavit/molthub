// Interfaces
export * from "./interface/provider";
export * from "./interface/deployment-target";

// Deployment Targets
export { LocalMachineTarget } from "./targets/local/local-target";
export { RemoteVMTarget } from "./targets/remote-vm/remote-vm-target";
export { DockerContainerTarget } from "./targets/docker/docker-target";
export { KubernetesTarget, KubernetesManifests } from "./targets/kubernetes/kubernetes-target";
export { EcsEc2Target } from "./targets/ecs-ec2/ecs-ec2-target";
export type { EcsEc2Config } from "./targets/ecs-ec2/ecs-ec2-config";
export { pushImageToEcr } from "./targets/ecs-ec2/ecr-push";
export { GceTarget } from "./targets/gce/gce-target";
export type { GceConfig } from "./targets/gce/gce-config";
export { AzureVmTarget } from "./targets/azure-vm/azure-vm-target";
export type { AzureVmConfig } from "./targets/azure-vm/azure-vm-config";
export type { EcrPushOptions, EcrPushResult } from "./targets/ecs-ec2/ecr-push";
export { generateProductionTemplate } from "./targets/ecs-ec2/templates/production";
export type { ProductionTemplateParams } from "./targets/ecs-ec2/templates/production";
export {
  CloudflareWorkersTarget,
  R2StateSync,
  DEFAULT_BACKUP_INTERVAL_MS,
  generateWranglerConfig,
  generateWorkerEntryPoint,
  mapEnvironment,
  rewriteAiGatewayUrl,
  isSecretKey,
  getSecretEntries,
} from "./targets/cloudflare-workers";
export type {
  R2BackupMetadata,
  SyncResult,
  ShouldRestoreResult,
  ValidationResult,
  WranglerConfigOutput,
  OpenClawContainerEnv,
  WorkerSecrets,
  EnvMappingResult,
} from "./targets/cloudflare-workers";

// Factories
export { DeploymentTargetFactory } from "./targets/factory";

// Security Configuration
export * from "./security";