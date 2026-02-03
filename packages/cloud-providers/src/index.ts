// Interfaces
export * from "./interface/provider";
export * from "./interface/deployment-target";

// Providers
export { AWSProvider, AWSProviderConfig } from "./providers/aws/aws-provider";
export { AzureProvider, AzureConfig } from "./providers/azure/azure-provider";
export { GCPProvider, GCPConfig } from "./providers/gcp/gcp-provider";
export { DigitalOceanProvider, DigitalOceanConfig } from "./providers/digitalocean/digitalocean-provider";
export { SelfHostedProvider, SelfHostedConfig } from "./providers/selfhosted/selfhosted-provider";
export { SimulatedProvider, SimulatedConfig } from "./providers/simulated/simulated-provider";

// Deployment Targets
export { LocalMachineTarget } from "./targets/local/local-target";
export { RemoteVMTarget } from "./targets/remote-vm/remote-vm-target";
export { DockerContainerTarget } from "./targets/docker/docker-target";
export { KubernetesTarget, KubernetesManifests } from "./targets/kubernetes/kubernetes-target";
export { EcsEc2Target } from "./targets/ecs-ec2/ecs-ec2-target";
export type { EcsEc2Config } from "./targets/ecs-ec2/ecs-ec2-config";
export { pushImageToEcr } from "./targets/ecs-ec2/ecr-push";
export { CloudRunTarget } from "./targets/cloud-run/cloud-run-target";
export type { CloudRunConfig } from "./targets/cloud-run/cloud-run-config";
export { AciTarget } from "./targets/aci/aci-target";
export type { AciConfig } from "./targets/aci/aci-config";
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
export { CloudProviderFactory, ProviderConfig } from "./providers/factory";
export { DeploymentTargetFactory } from "./targets/factory";