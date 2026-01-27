import { Injectable, Logger } from "@nestjs/common";
import { prisma, Instance, InstanceStatus } from "@molthub/database";
import { ECSService, InstanceManifest } from "@molthub/core";

export interface DriftCheckResult {
  hasDrift: boolean;
  differences: DriftDifference[];
  actualState: {
    taskDefinitionArn?: string;
    runningCount: number;
    desiredCount: number;
    status: string;
  };
}

export interface DriftDifference {
  field: string;
  expected: unknown;
  actual: unknown;
  severity: "CRITICAL" | "WARNING" | "INFO";
}

@Injectable()
export class DriftDetectionService {
  private readonly logger = new Logger(DriftDetectionService.name);
  private readonly ecs = new ECSService();

  async checkDrift(instance: Instance, manifest: InstanceManifest): Promise<DriftCheckResult> {
    const differences: DriftDifference[] = [];

    if (!instance.ecsServiceArn) {
      return {
        hasDrift: true,
        differences: [{
          field: "ecsService",
          expected: "running",
          actual: "missing",
          severity: "CRITICAL",
        }],
        actualState: {
          runningCount: 0,
          desiredCount: 0,
          status: "MISSING",
        },
      };
    }

    const clusterArn = process.env.ECS_CLUSTER_ARN || "";
    const serviceName = instance.ecsServiceArn.split("/").pop() || "";

    // Get actual ECS service state
    const serviceStatus = await this.ecs.getServiceStatus(clusterArn, serviceName);

    // Check 1: Task count drift
    if (serviceStatus.desiredCount !== manifest.spec.runtime.replicas) {
      differences.push({
        field: "replicas",
        expected: manifest.spec.runtime.replicas,
        actual: serviceStatus.desiredCount,
        severity: "CRITICAL",
      });
    }

    // Check 2: Running vs Desired
    if (serviceStatus.runningCount < serviceStatus.desiredCount) {
      differences.push({
        field: "runningTasks",
        expected: serviceStatus.desiredCount,
        actual: serviceStatus.runningCount,
        severity: "WARNING",
      });
    }

    // Check 3: Task definition drift
    if (instance.taskDefinitionArn) {
      // In a full implementation, we'd describe the task definition and compare
      // For now, we just track if the service is using a different task def
      // This would require storing the expected task def revision
    }

    // Check 4: Service status
    if (serviceStatus.status !== "ACTIVE") {
      differences.push({
        field: "serviceStatus",
        expected: "ACTIVE",
        actual: serviceStatus.status,
        severity: "CRITICAL",
      });
    }

    // Update instance status based on drift
    const hasCriticalDrift = differences.some(d => d.severity === "CRITICAL");
    const hasWarningDrift = differences.some(d => d.severity === "WARNING");

    if (hasCriticalDrift && instance.status === InstanceStatus.RUNNING) {
      await prisma.instance.update({
        where: { id: instance.id },
        data: { status: InstanceStatus.DEGRADED },
      });
    }

    return {
      hasDrift: differences.length > 0,
      differences,
      actualState: {
        taskDefinitionArn: instance.taskDefinitionArn || undefined,
        runningCount: serviceStatus.runningCount,
        desiredCount: serviceStatus.desiredCount,
        status: serviceStatus.status,
      },
    };
  }

  async checkAllInstances(): Promise<{ instanceId: string; result: DriftCheckResult }[]> {
    const instances = await prisma.instance.findMany({
      where: {
        status: { in: [InstanceStatus.RUNNING, InstanceStatus.DEGRADED] },
      },
    });

    const results = [];

    for (const instance of instances) {
      if (!instance.desiredManifestId) continue;

      const manifestVersion = await prisma.manifestVersion.findUnique({
        where: { id: instance.desiredManifestId },
      });

      if (!manifestVersion) continue;

      try {
        const result = await this.checkDrift(instance, manifestVersion.content as InstanceManifest);
        results.push({ instanceId: instance.id, result });

        // Log drift events
        if (result.hasDrift) {
          await prisma.deploymentEvent.create({
            data: {
              instanceId: instance.id,
              eventType: "DRIFT_DETECTED",
              message: `Drift detected: ${result.differences.map(d => d.field).join(", ")}`,
              metadata: { differences: result.differences },
            },
          });
        }
      } catch (error) {
        this.logger.error(`Failed to check drift for ${instance.id}: ${error}`);
      }
    }

    return results;
  }
}