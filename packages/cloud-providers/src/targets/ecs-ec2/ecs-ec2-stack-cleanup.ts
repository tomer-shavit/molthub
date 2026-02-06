/**
 * Stack Cleanup Service
 *
 * Handles recovery from CloudFormation DELETE_FAILED state by cleaning up
 * stuck resources (ECS container instances, ASG scale-in protection) and
 * retrying deletion with escalating strategies.
 *
 * Extracted from EcsEc2Target to keep the deployment target focused on
 * lifecycle operations while this module handles failure recovery.
 */

import type {
  ICloudFormationService,
  IECSService,
  IAutoScalingService,
} from "./ecs-ec2-services.interface";

/**
 * Dependencies required by the stack cleanup service.
 */
export interface StackCleanupDeps {
  cloudFormation: ICloudFormationService;
  ecs: IECSService;
  autoScaling: IAutoScalingService;
  clusterName: string;
  stackName: string;
  log: (msg: string, stream?: "stdout" | "stderr") => void;
  waitForStack: (targetStatus: "DELETE_COMPLETE") => Promise<void>;
}

/**
 * Service for cleaning up stuck CloudFormation stack resources and
 * force-deleting stacks in DELETE_FAILED state.
 */
export class StackCleanupService {
  constructor(private readonly deps: StackCleanupDeps) {}

  /**
   * Clean up stuck resources that prevent a CloudFormation stack from deleting.
   * Handles the common ECS EC2 deletion failures:
   * - ECS cluster with active container instances
   * - ASG with scale-in protected instances (orphaned from deleted capacity provider)
   */
  async cleanupStuckResources(): Promise<void> {
    // 1. Deregister all container instances from the ECS cluster
    //    (single page is sufficient — bot clusters have at most 1-2 instances)
    try {
      const instanceArns = await this.deps.ecs.listContainerInstances(this.deps.clusterName);
      if (instanceArns.length > 0) {
        this.deps.log(`Found ${instanceArns.length} container instance(s) to deregister from cluster ${this.deps.clusterName}`);
        for (const arn of instanceArns) {
          try {
            await this.deps.ecs.deregisterContainerInstance(this.deps.clusterName, arn, true);
            this.deps.log(`Deregistered container instance: ${arn.split("/").pop()}`);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            this.deps.log(`Failed to deregister container instance: ${msg}`, "stderr");
          }
        }
      }
    } catch (err: unknown) {
      // Cluster may already be deleted — not a problem
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("ClusterNotFoundException")) {
        this.deps.log(`Warning: could not list container instances: ${msg}`, "stderr");
      }
    }

    // 2. Remove scale-in protection from ASG instances
    const asgName = `${this.deps.clusterName}-asg`;
    try {
      await this.deps.autoScaling.removeScaleInProtection(asgName);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.deps.log(`Warning: could not clean up ASG instances: ${msg}`, "stderr");
    }
  }

  /**
   * Force-delete a CloudFormation stack that is in DELETE_FAILED state.
   * Strategy:
   * 1. Clean up stuck resources (deregister container instances, remove ASG protection)
   * 2. Retry normal deletion
   * 3. If still failing, use RetainResources to skip remaining stuck resources
   */
  async forceDeleteStack(): Promise<void> {
    this.deps.log("Cleaning up stuck resources before retrying stack deletion...");
    await this.cleanupStuckResources();

    // First retry: delete normally (stuck resources should be unblocked now)
    this.deps.log("Retrying stack deletion...");
    await this.deps.cloudFormation.deleteStack(this.deps.stackName);

    try {
      await this.deps.waitForStack("DELETE_COMPLETE");
      return;
    } catch (retryError: unknown) {
      // If it failed again, identify the stuck resources and retain them
      const stackInfo = await this.deps.cloudFormation.describeStack(this.deps.stackName);
      if (!stackInfo || stackInfo.status === "DELETE_COMPLETE") {
        return; // Stack is gone
      }

      if (stackInfo.status === "DELETE_FAILED") {
        const reason = stackInfo.statusReason ?? "";
        const match = reason.match(/\[([^\]]+)\]/);
        const stuckResources = match
          ? match[1].split(",").map((r) => r.trim())
          : [];

        if (stuckResources.length > 0) {
          this.deps.log(`Retaining stuck resources and forcing deletion: ${stuckResources.join(", ")}`, "stderr");
          await this.deps.cloudFormation.deleteStack(this.deps.stackName, {
            retainResources: stuckResources,
          });
          await this.deps.waitForStack("DELETE_COMPLETE");
          return;
        }
      }

      throw retryError;
    }
  }
}
