import {
  DeploymentTarget,
  DeploymentTargetType,
  DeploymentTargetConfig,
} from "../interface/deployment-target";
import { LocalMachineTarget } from "./local/local-target";
import { RemoteVMTarget } from "./remote-vm/remote-vm-target";
import { DockerContainerTarget } from "./docker/docker-target";
import { KubernetesTarget } from "./kubernetes/kubernetes-target";
import { EcsEc2Target } from "./ecs-ec2/ecs-ec2-target";
import { GceTarget } from "./gce/gce-target";
import { AzureVmTarget } from "./azure-vm/azure-vm-target";
import { CloudflareWorkersTarget } from "./cloudflare-workers/cloudflare-workers-target";

/**
 * Factory for creating DeploymentTarget instances based on configuration.
 *
 * Supports creating targets for local machines, remote VMs (SSH),
 * Docker containers, and Kubernetes deployments.
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
    switch (config.type) {
      case "local":
        return new LocalMachineTarget();

      case "remote-vm":
        if (!config.ssh) {
          throw new Error("RemoteVM target requires 'ssh' configuration");
        }
        return new RemoteVMTarget(config.ssh);

      case "docker":
        if (!config.docker) {
          throw new Error("Docker target requires 'docker' configuration");
        }
        return new DockerContainerTarget(config.docker);

      case "kubernetes":
        if (!config.k8s) {
          throw new Error("Kubernetes target requires 'k8s' configuration");
        }
        return new KubernetesTarget(config.k8s);

      case "ecs-ec2":
        if (!config.ecs) {
          throw new Error("ECS EC2 target requires 'ecs' configuration");
        }
        return new EcsEc2Target(config.ecs);

      case "gce":
        if (!config.gce) {
          throw new Error("GCE target requires 'gce' configuration");
        }
        return new GceTarget(config.gce);

      case "azure-vm":
        if (!config.azureVm) {
          throw new Error("Azure VM target requires 'azureVm' configuration");
        }
        return new AzureVmTarget(config.azureVm);

      case "cloudflare-workers":
        if (!config.cloudflare) {
          throw new Error("Cloudflare Workers target requires 'cloudflare' configuration");
        }
        return new CloudflareWorkersTarget(config.cloudflare);

      default: {
        const exhaustive: never = config;
        throw new Error(`Unknown deployment target type: ${(exhaustive as { type: string }).type}`);
      }
    }
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
    return [
      {
        type: DeploymentTargetType.LOCAL,
        name: "Local Machine",
        description: "Deploy on the current machine using systemd (Linux) or launchctl (macOS)",
        status: "ready",
      },
      {
        type: DeploymentTargetType.REMOTE_VM,
        name: "Remote VM (SSH)",
        description: "Deploy on a remote machine via SSH connection",
        status: "beta",
      },
      {
        type: DeploymentTargetType.DOCKER,
        name: "Docker Container",
        description: "Run in a Docker container with mounted configuration",
        status: "ready",
      },
      {
        type: DeploymentTargetType.KUBERNETES,
        name: "Kubernetes",
        description: "Deploy as a Kubernetes Deployment with Service and ConfigMap",
        status: "ready",
      },
      {
        type: DeploymentTargetType.ECS_EC2,
        name: "AWS ECS EC2",
        description: "Deploy on AWS ECS with EC2 launch type (enables Docker sandbox isolation)",
        status: "ready",
      },
      {
        type: DeploymentTargetType.GCE,
        name: "Google Compute Engine",
        description: "Deploy on GCE VM with persistent disk for WhatsApp sessions and sandbox support",
        status: "ready",
      },
      {
        type: DeploymentTargetType.AZURE_VM,
        name: "Azure Virtual Machine",
        description: "Deploy on Azure VM with managed disk for WhatsApp sessions and sandbox support",
        status: "ready",
      },
      {
        type: DeploymentTargetType.CLOUDFLARE_WORKERS,
        name: "Cloudflare Workers",
        description: "Deploy on Cloudflare Workers with Sandbox containers and R2 state persistence",
        status: "ready",
      },
    ];
  }

  /**
   * Check if a deployment target type is currently supported.
   */
  static isTargetSupported(type: DeploymentTargetType): boolean {
    return [
      DeploymentTargetType.LOCAL,
      DeploymentTargetType.REMOTE_VM,
      DeploymentTargetType.DOCKER,
      DeploymentTargetType.KUBERNETES,
      DeploymentTargetType.ECS_EC2,
      DeploymentTargetType.GCE,
      DeploymentTargetType.AZURE_VM,
      DeploymentTargetType.CLOUDFLARE_WORKERS,
    ].includes(type);
  }
}
