import { 
  ECSClient, 
  CreateServiceCommand, 
  UpdateServiceCommand,
  DeleteServiceCommand,
  RegisterTaskDefinitionCommand,
  DeregisterTaskDefinitionCommand,
  DescribeServicesCommand,
  DescribeTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";
import { InstanceManifest } from "@clawster/core";

export interface ECSDeploymentConfig {
  clusterArn: string;
  serviceName: string;
  taskDefinitionFamily: string;
  desiredCount: number;
}

export class ECSService {
  private client: ECSClient;

  constructor(region: string = "us-east-1") {
    this.client = new ECSClient({ region });
  }

  async createTaskDefinition(
    family: string,
    manifest: InstanceManifest,
    secrets: Record<string, string> = {}
  ): Promise<string> {
    const containerName = "openclaw";
    const image = manifest.spec.runtime.image;
    const cpu = manifest.spec.runtime.cpu.toString();
    const memory = manifest.spec.runtime.memory.toString();

    const command = manifest.spec.runtime.command;

    // Convert secrets to ECS format
    const secretsList = Object.entries(secrets).map(([name, valueFrom]) => ({
      name,
      valueFrom,
    }));

    const result = await this.client.send(new RegisterTaskDefinitionCommand({
      family,
      networkMode: "awsvpc",
      requiresCompatibilities: ["EC2"],
      cpu,
      memory,
      executionRoleArn: process.env.ECS_EXECUTION_ROLE_ARN,
      taskRoleArn: process.env.ECS_TASK_ROLE_ARN,
      containerDefinitions: [{
        name: containerName,
        image,
        essential: true,
        command,
        secrets: secretsList.length > 0 ? secretsList : undefined,
        environment: [
          { name: "OPENCLAW_LOG_LEVEL", value: manifest.spec.observability?.logLevel || "info" },
          { name: "OPENCLAW_WORKSPACE", value: manifest.metadata.workspace },
          { name: "OPENCLAW_INSTANCE", value: manifest.metadata.name },
        ],
        logConfiguration: {
          logDriver: "awslogs",
          options: {
            "awslogs-group": `/clawster/${manifest.metadata.workspace}/${manifest.metadata.name}`,
            "awslogs-region": process.env.AWS_REGION || "us-east-1",
            "awslogs-stream-prefix": "openclaw",
          },
        },
        portMappings: manifest.spec.network.inbound === "WEBHOOK" ? [
          { containerPort: 3000, protocol: "tcp" }
        ] : undefined,
        // ── Container hardening (Hack #7) ──
        linuxParameters: {
          initProcessEnabled: true,
          capabilities: {
            drop: ["ALL"],
          },
        },
        readonlyRootFilesystem: true,
        privileged: false,
        user: "1000:1000",
        mountPoints: [
          { sourceVolume: "tmp-volume", containerPath: "/tmp", readOnly: false },
        ],
      }],
      volumes: [
        { name: "tmp-volume", host: {} },
      ],
    }));

    return result.taskDefinition?.taskDefinitionArn || "";
  }

  async createService(
    clusterArn: string,
    serviceName: string,
    taskDefinitionArn: string,
    manifest: InstanceManifest
  ): Promise<string> {
    const subnetIds = process.env.PRIVATE_SUBNET_IDS?.split(",") || [];
    const securityGroupId = process.env.SECURITY_GROUP_ID;

    const result = await this.client.send(new CreateServiceCommand({
      cluster: clusterArn,
      serviceName,
      taskDefinition: taskDefinitionArn,
      desiredCount: manifest.spec.runtime.replicas,
      launchType: "EC2",
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: subnetIds,
          securityGroups: securityGroupId ? [securityGroupId] : undefined,
          assignPublicIp: "DISABLED",
        },
      },
      deploymentConfiguration: {
        minimumHealthyPercent: 100,
        maximumPercent: 200,
      },
    }));

    return result.service?.serviceArn || "";
  }

  async updateService(
    clusterArn: string,
    serviceName: string,
    taskDefinitionArn: string,
    desiredCount?: number
  ): Promise<void> {
    await this.client.send(new UpdateServiceCommand({
      cluster: clusterArn,
      service: serviceName,
      taskDefinition: taskDefinitionArn,
      desiredCount,
    }));
  }

  async deleteService(clusterArn: string, serviceName: string): Promise<void> {
    // First scale to 0
    await this.updateService(clusterArn, serviceName, "", 0);
    
    // Then delete
    await this.client.send(new DeleteServiceCommand({
      cluster: clusterArn,
      service: serviceName,
      force: true,
    }));
  }

  async getServiceStatus(clusterArn: string, serviceName: string): Promise<{
    status: string;
    runningCount: number;
    desiredCount: number;
    pendingCount: number;
    health: "HEALTHY" | "UNHEALTHY" | "UNKNOWN";
  }> {
    const result = await this.client.send(new DescribeServicesCommand({
      cluster: clusterArn,
      services: [serviceName],
    }));

    const service = result.services?.[0];
    if (!service) {
      return { status: "MISSING", runningCount: 0, desiredCount: 0, pendingCount: 0, health: "UNKNOWN" };
    }

    // Determine health based on running vs desired
    let health: "HEALTHY" | "UNHEALTHY" | "UNKNOWN" = "UNKNOWN";
    const runningCount = service.runningCount ?? 0;
    const desiredCount = service.desiredCount ?? 0;
    if (runningCount === desiredCount && desiredCount > 0) {
      health = "HEALTHY";
    } else if (runningCount < desiredCount) {
      health = "UNHEALTHY";
    }

    return {
      status: service.status || "UNKNOWN",
      runningCount: service.runningCount || 0,
      desiredCount: service.desiredCount || 0,
      pendingCount: service.pendingCount || 0,
      health,
    };
  }
}