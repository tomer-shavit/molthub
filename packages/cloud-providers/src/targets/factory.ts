import {
  DeploymentTarget,
  DeploymentTargetType,
  DeploymentTargetConfig,
} from "../interface/deployment-target";
import { AdapterRegistry } from "../registry/adapter-registry";
import { LocalMachineTarget } from "./local/local-target";
import { DockerContainerTarget } from "./docker/docker-target";
import { AwsEc2Target as EcsEc2Target } from "./ecs-ec2/aws-ec2-target";
import { GceTarget } from "./gce/gce-target";
import { AzureVmTarget } from "./azure-vm/azure-vm-target";

/**
 * Register adapters with the registry.
 * This is called once when the factory module is loaded.
 */
function registerBuiltinAdapters(): void {
  const registry = AdapterRegistry.getInstance();

  // Local - has full getMetadata() support
  registry.register(
    DeploymentTargetType.LOCAL,
    () => new LocalMachineTarget(),
    new LocalMachineTarget().getMetadata()
  );

  // Docker - has full getMetadata() support
  registry.register(
    DeploymentTargetType.DOCKER,
    (config: unknown) => {
      const c = config as DeploymentTargetConfig;
      if (c.type !== "docker" || !c.docker) {
        throw new Error("Docker target requires 'docker' configuration");
      }
      return new DockerContainerTarget(c.docker);
    },
    new DockerContainerTarget({ containerName: "", configPath: "", gatewayPort: 18789 }).getMetadata()
  );

  // ECS EC2 - has full getMetadata() support
  registry.register(
    DeploymentTargetType.ECS_EC2,
    (config: unknown) => {
      const c = config as DeploymentTargetConfig;
      if (c.type !== "ecs-ec2" || !c.ecs) {
        throw new Error("ECS EC2 target requires 'ecs' configuration");
      }
      return new EcsEc2Target(c.ecs);
    },
    new EcsEc2Target({
      accessKeyId: "",
      secretAccessKey: "",
      region: "us-east-1",
      profileName: "temp",
    }).getMetadata()
  );

  // GCE - has full getMetadata() support
  registry.register(
    DeploymentTargetType.GCE,
    (config: unknown) => {
      const c = config as DeploymentTargetConfig;
      if (c.type !== "gce" || !c.gce) {
        throw new Error("GCE target requires 'gce' configuration");
      }
      return new GceTarget(c.gce);
    },
    new GceTarget({
      projectId: "",
      zone: "us-central1-a",
      profileName: "temp",
    }).getMetadata()
  );

  // Azure VM - has full getMetadata() support
  registry.register(
    DeploymentTargetType.AZURE_VM,
    (config: unknown) => {
      const c = config as DeploymentTargetConfig;
      if (c.type !== "azure-vm" || !c.azureVm) {
        throw new Error("Azure VM target requires 'azureVm' configuration");
      }
      return new AzureVmTarget(c.azureVm);
    },
    new AzureVmTarget({
      subscriptionId: "",
      resourceGroup: "",
      region: "eastus",
      profileName: "temp",
    }).getMetadata()
  );
}

// Register built-in adapters on module load
registerBuiltinAdapters();

/**
 * Factory for creating DeploymentTarget instances based on configuration.
 *
 * Supports creating targets for local machines, Docker containers,
 * and cloud providers (AWS ECS, GCE, Azure).
 *
 * All targets are created via the AdapterRegistry, which handles
 * adapter registration and instantiation.
 */
export class DeploymentTargetFactory {
  /**
   * Create a deployment target from a typed configuration object.
   *
   * @param config - Configuration specifying the target type and its settings
   * @returns A DeploymentTarget instance ready for use
   * @throws Error if the target type is unknown or configuration is invalid
   */
  static create(config: DeploymentTargetConfig): DeploymentTarget {
    const registry = AdapterRegistry.getInstance();
    return registry.create(config);
  }

  /**
   * Returns metadata about all available deployment target types.
   */
  static getAvailableTargets(): Array<{
    type: DeploymentTargetType;
    name: string;
    description: string;
    status: "ready" | "beta" | "coming_soon";
  }> {
    const registry = AdapterRegistry.getInstance();
    return registry.getAllMetadata().map((m) => ({
      type: m.type,
      name: m.displayName,
      description: m.description,
      status: m.status,
    }));
  }

  /**
   * Check if a deployment target type is currently supported.
   */
  static isTargetSupported(type: DeploymentTargetType): boolean {
    return AdapterRegistry.getInstance().isRegistered(type);
  }

  /**
   * Get the AdapterRegistry instance for direct access to adapter metadata.
   */
  static getRegistry(): AdapterRegistry {
    return AdapterRegistry.getInstance();
  }
}
