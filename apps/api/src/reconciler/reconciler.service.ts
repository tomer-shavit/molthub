import { Injectable, Logger } from "@nestjs/common";
import { prisma, Instance, InstanceStatus, DeploymentEventType } from "@molthub/database";
import { ECSService, SecretsManagerService, CloudWatchLogsService, validateManifest } from "@molthub/core";

export interface ReconcileResult {
  success: boolean;
  message: string;
  changes: string[];
}

@Injectable()
export class ReconcilerService {
  private readonly logger = new Logger(ReconcilerService.name);
  private readonly ecs = new ECSService();
  private readonly secrets = new SecretsManagerService();
  private readonly logs = new CloudWatchLogsService();

  async reconcile(instanceId: string): Promise<ReconcileResult> {
    const startTime = Date.now();
    
    try {
      // Load instance with desired manifest
      const instance = await prisma.instance.findUnique({
        where: { id: instanceId },
        include: {
          workspace: true,
        },
      });

      if (!instance) {
        throw new Error(`Instance ${instanceId} not found`);
      }

      if (!instance.desiredManifestId) {
        throw new Error(`No desired manifest set for instance ${instanceId}`);
      }

      // Load the desired manifest
      const manifestVersion = await prisma.manifestVersion.findUnique({
        where: { id: instance.desiredManifestId },
      });

      if (!manifestVersion) {
        throw new Error(`Manifest ${instance.desiredManifestId} not found`);
      }

      // Validate manifest
      const manifest = validateManifest(manifestVersion.content);

      // Log reconcile start
      await this.logEvent(instanceId, DeploymentEventType.RECONCILE_START, "Starting reconciliation");

      const changes: string[] = [];

      // Step 1: Ensure CloudWatch log group exists
      const logGroupName = `/molthub/${manifest.metadata.workspace}/${manifest.metadata.name}`;
      if (!await this.logs.logGroupExists(logGroupName)) {
        await this.logs.createLogGroup(logGroupName, {
          managedBy: "molthub",
          workspace: manifest.metadata.workspace,
          instance: manifest.metadata.name,
        });
        changes.push(`Created CloudWatch log group: ${logGroupName}`);
      }

      // Step 2: Process secrets
      const secretArns: Record<string, string> = {};
      for (const secret of manifest.spec.secrets) {
        // In real implementation, fetch actual secret values from secure store
        // For now, assume they exist in Secrets Manager
        secretArns[secret.name] = secret.key; // The key is the ARN
      }

      // Step 3: Create/update task definition
      const taskFamily = `molthub-${manifest.metadata.workspace}-${manifest.metadata.name}`;
      const taskDefArn = await this.ecs.createTaskDefinition(
        taskFamily,
        manifest,
        secretArns
      );
      changes.push(`Created task definition: ${taskDefArn}`);

      // Step 4: Create/update ECS service
      const clusterArn = process.env.ECS_CLUSTER_ARN || "";
      const serviceName = `${manifest.metadata.workspace}-${manifest.metadata.name}`;

      let serviceArn: string;
      if (instance.ecsServiceArn) {
        // Update existing service
        await this.ecs.updateService(clusterArn, serviceName, taskDefArn, manifest.spec.runtime.replicas);
        serviceArn = instance.ecsServiceArn;
        changes.push(`Updated ECS service: ${serviceArn}`);
      } else {
        // Create new service
        serviceArn = await this.ecs.createService(clusterArn, serviceName, taskDefArn, manifest);
        changes.push(`Created ECS service: ${serviceArn}`);
      }

      // Step 5: Update instance status
      await prisma.instance.update({
        where: { id: instanceId },
        data: {
          status: InstanceStatus.RUNNING,
          ecsServiceArn: serviceArn,
          taskDefinitionArn: taskDefArn,
          cloudwatchLogGroup: logGroupName,
          lastReconcileAt: new Date(),
          lastError: null,
        },
      });

      // Step 6: Check service health
      const health = await this.ecs.getServiceStatus(clusterArn, serviceName);
      if (health.health === "HEALTHY") {
        await this.logEvent(instanceId, DeploymentEventType.RECONCILE_SUCCESS, 
          `Reconciliation completed in ${Date.now() - startTime}ms. Service is healthy.`);
      } else {
        await prisma.instance.update({
          where: { id: instanceId },
          data: { status: InstanceStatus.DEGRADED },
        });
        await this.logEvent(instanceId, DeploymentEventType.RECONCILE_SUCCESS, 
          `Reconciliation completed but service is unhealthy: ${health.runningCount}/${health.desiredCount} tasks running`);
      }

      return {
        success: true,
        message: `Reconciliation completed successfully in ${Date.now() - startTime}ms`,
        changes,
      };

    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      
      this.logger.error(`Reconciliation failed for ${instanceId}: ${message}`);
      
      await prisma.instance.update({
        where: { id: instanceId },
        data: {
          status: InstanceStatus.ERROR,
          lastError: message,
        },
      });

      await this.logEvent(instanceId, DeploymentEventType.RECONCILE_ERROR, message);

      return {
        success: false,
        message: `Reconciliation failed: ${message}`,
        changes: [],
      };
    }
  }

  async stop(instanceId: string): Promise<void> {
    const instance = await prisma.instance.findUnique({
      where: { id: instanceId },
    });

    if (!instance || !instance.ecsServiceArn) {
      return;
    }

    const clusterArn = process.env.ECS_CLUSTER_ARN || "";
    const serviceName = instance.ecsServiceArn.split("/").pop() || "";

    await this.ecs.updateService(clusterArn, serviceName, "", 0);
    
    await prisma.instance.update({
      where: { id: instanceId },
      data: { status: InstanceStatus.STOPPED },
    });
  }

  async delete(instanceId: string): Promise<void> {
    const instance = await prisma.instance.findUnique({
      where: { id: instanceId },
    });

    if (!instance) {
      return;
    }

    const clusterArn = process.env.ECS_CLUSTER_ARN || "";

    // Delete ECS service
    if (instance.ecsServiceArn) {
      const serviceName = instance.ecsServiceArn.split("/").pop() || "";
      await this.ecs.deleteService(clusterArn, serviceName);
      await this.logEvent(instanceId, DeploymentEventType.ECS_DEPLOYMENT, "Deleted ECS service");
    }

    // Delete CloudWatch log group
    if (instance.cloudwatchLogGroup) {
      await this.logs.deleteLogGroup(instance.cloudwatchLogGroup);
    }

    // Mark instance as deleted
    await prisma.instance.delete({
      where: { id: instanceId },
    });
  }

  private async logEvent(
    instanceId: string, 
    eventType: DeploymentEventType, 
    message: string
  ): Promise<void> {
    await prisma.deploymentEvent.create({
      data: {
        instanceId,
        eventType,
        message,
      },
    });
  }
}