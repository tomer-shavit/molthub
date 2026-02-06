/**
 * Shared Infrastructure Manager for ECS EC2 deployments.
 *
 * Provides idempotent management of the shared CloudFormation stack
 * that contains VPC, VPC endpoints, and IAM roles. The shared stack
 * is created once per region and reused across all bot deployments.
 *
 * Handles:
 * - Idempotent creation (creates only if not exists)
 * - Concurrent creation (waits if another deploy is already creating)
 * - Output retrieval (reads CF exports as SharedInfraOutputs)
 */

import type { ICloudFormationService, IEC2Service, StackStatus } from "../ecs-ec2-services.interface";
import type { SharedInfraOutputs } from "./shared-infra-config";
import { getSharedInfraStackName, BOT_STACK_PREFIX } from "./shared-infra-config";
import { generateSharedInfraTemplate } from "./templates/shared-production";

/**
 * Ensure shared infrastructure exists for the given region.
 * Idempotent: creates the stack if it doesn't exist, waits if it's
 * being created by another deployment, and returns outputs.
 *
 * @param cfService - CloudFormation service to use
 * @param region - AWS region for the shared stack
 * @param onLog - Optional log callback for progress updates
 * @returns Shared infrastructure outputs
 */
export async function ensureSharedInfra(
  cfService: ICloudFormationService,
  region: string,
  onLog?: (message: string, stream?: "stdout" | "stderr") => void,
): Promise<SharedInfraOutputs> {
  const stackName = getSharedInfraStackName(region);
  const log = onLog ?? (() => {});

  const exists = await cfService.stackExists(stackName);

  if (exists) {
    // Stack exists — check if it's still being created
    const stack = await cfService.describeStack(stackName);
    const status = stack?.status;

    if (status === "CREATE_IN_PROGRESS") {
      log(`Shared infra stack ${stackName} is being created by another deployment, waiting...`);
      await cfService.waitForStackStatus(stackName, "CREATE_COMPLETE", {
        timeoutMs: 600000, // 10 min max for VPC endpoints
      });
      log("Shared infra stack is ready");
    } else if (status === "CREATE_COMPLETE" || status === "UPDATE_COMPLETE") {
      log(`Shared infra stack ${stackName} already exists and is ready`);
    } else if (status === "UPDATE_IN_PROGRESS") {
      log(`Shared infra stack ${stackName} is being updated, waiting...`);
      await cfService.waitForStackStatus(stackName, "UPDATE_COMPLETE", {
        timeoutMs: 600000,
      });
      log("Shared infra stack update complete");
    } else {
      // Stack is in an unexpected state (ROLLBACK, DELETE, etc.)
      throw new Error(
        `Shared infra stack ${stackName} is in unexpected state: ${status}. ` +
        `Manual intervention may be required.`,
      );
    }
  } else {
    // Stack doesn't exist — create it
    log(`Creating shared infra stack ${stackName}...`);
    const template = generateSharedInfraTemplate();

    try {
      await cfService.createStack(
        stackName,
        JSON.stringify(template),
        {
          capabilities: ["CAPABILITY_NAMED_IAM"],
          tags: { "clawster:shared": "true" },
        },
      );

      log("Waiting for shared infra stack to complete (~3 min for IAM InstanceProfile)...");
      await cfService.waitForStackStatus(stackName, "CREATE_COMPLETE", {
        timeoutMs: 600000, // 10 min max
      });
      log("Shared infra stack created successfully");
    } catch (error: unknown) {
      // Handle race condition: another deployment created the stack between
      // our stackExists check and our createStack call
      if (
        error instanceof Error &&
        error.message.includes("AlreadyExistsException")
      ) {
        log("Shared infra stack was created by another deployment, waiting...");
        await cfService.waitForStackStatus(stackName, "CREATE_COMPLETE", {
          timeoutMs: 600000,
        });
        log("Shared infra stack is ready");
      } else {
        throw error;
      }
    }
  }

  return getSharedInfraOutputs(cfService, region);
}

/**
 * Get outputs from an existing shared infrastructure stack.
 *
 * @param cfService - CloudFormation service to use
 * @param region - AWS region
 * @returns Shared infrastructure outputs, or null if stack doesn't exist
 */
export async function getSharedInfraOutputs(
  cfService: ICloudFormationService,
  region: string,
): Promise<SharedInfraOutputs> {
  const stackName = getSharedInfraStackName(region);
  const outputs = await cfService.getStackOutputs(stackName);

  return {
    vpcId: outputs["VpcId"] ?? "",
    publicSubnet1: outputs["PublicSubnet1Id"] ?? "",
    publicSubnet2: outputs["PublicSubnet2Id"] ?? "",
    privateSubnet1: outputs["PrivateSubnet1Id"] ?? "",
    privateSubnet2: outputs["PrivateSubnet2Id"] ?? "",
    privateRouteTable: outputs["PrivateRouteTableId"] ?? "",
    natInstanceId: outputs["NatInstanceId"] ?? "",
    ec2InstanceProfileArn: outputs["Ec2InstanceProfileArn"] ?? "",
    taskExecutionRoleArn: outputs["TaskExecutionRoleArn"] ?? "",
  };
}

/**
 * Check if shared infrastructure is ready for a given region.
 *
 * @param cfService - CloudFormation service to use
 * @param region - AWS region
 * @returns true if the shared stack exists and is in a ready state
 */
export async function isSharedInfraReady(
  cfService: ICloudFormationService,
  region: string,
): Promise<boolean> {
  const stackName = getSharedInfraStackName(region);

  const exists = await cfService.stackExists(stackName);
  if (!exists) return false;

  const stack = await cfService.describeStack(stackName);
  return stack?.status === "CREATE_COMPLETE" || stack?.status === "UPDATE_COMPLETE";
}

/** Active CF stack statuses — everything except DELETE_COMPLETE */
const ACTIVE_STACK_STATUSES: StackStatus[] = [
  "CREATE_COMPLETE",
  "CREATE_IN_PROGRESS",
  "CREATE_FAILED",
  "UPDATE_COMPLETE",
  "UPDATE_IN_PROGRESS",
  "UPDATE_FAILED",
  "DELETE_IN_PROGRESS",
  "DELETE_FAILED",
  "ROLLBACK_IN_PROGRESS",
  "ROLLBACK_COMPLETE",
  "ROLLBACK_FAILED",
  "UPDATE_ROLLBACK_COMPLETE",
  "UPDATE_ROLLBACK_IN_PROGRESS",
  "UPDATE_ROLLBACK_FAILED",
];

/**
 * Clean up shared infrastructure if no per-bot stacks remain.
 *
 * Called after a per-bot stack is deleted. Checks whether any other
 * per-bot stacks still exist in the region. If none remain, fires
 * off shared stack deletion (non-blocking).
 *
 * Best-effort: errors are logged but never thrown.
 */
export async function cleanupSharedInfraIfOrphaned(
  cfService: ICloudFormationService,
  ec2Service: IEC2Service | undefined,
  region: string,
  onLog?: (message: string, stream?: "stdout" | "stderr") => void,
): Promise<void> {
  const log = onLog ?? (() => {});
  const sharedStackName = getSharedInfraStackName(region);

  try {
    // 1. Check if shared stack even exists
    const sharedExists = await cfService.stackExists(sharedStackName);
    if (!sharedExists) {
      log("Shared infra stack does not exist, nothing to clean up");
      return;
    }

    // 2. Check for remaining per-bot stacks (including those still deleting)
    const botStacks = await cfService.listStacks({
      statusFilter: ACTIVE_STACK_STATUSES,
      namePrefix: BOT_STACK_PREFIX,
    });

    if (botStacks.length > 0) {
      log(
        `${botStacks.length} bot stack(s) still active, keeping shared infra: ` +
        botStacks.map((s) => s.stackName).join(", "),
      );
      return;
    }

    // 3. No bot stacks remain — clean up shared infra
    log("No bot stacks remaining, starting shared infra cleanup...");
    try {
      await deleteSharedInfra(cfService, ec2Service, sharedStackName, log);
    } catch (deleteErr) {
      const msg = deleteErr instanceof Error ? deleteErr.message : String(deleteErr);
      log(`Shared infra cleanup failed (non-fatal): ${msg}`, "stderr");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`Shared infra cleanup check failed (non-fatal): ${msg}`, "stderr");
  }
}

/**
 * Delete the shared infra stack after disabling NAT termination protection.
 *
 * @internal Exported for testing.
 */
export async function deleteSharedInfra(
  cfService: ICloudFormationService,
  ec2Service: IEC2Service | undefined,
  sharedStackName: string,
  log: (message: string, stream?: "stdout" | "stderr") => void,
): Promise<void> {
  // 1. Disable NAT instance termination protection
  if (ec2Service) {
    try {
      const outputs = await cfService.getStackOutputs(sharedStackName);
      const natInstanceId = outputs["NatInstanceId"];
      if (natInstanceId) {
        log(`Disabling termination protection on NAT instance ${natInstanceId}...`);
        await ec2Service.disableTerminationProtection(natInstanceId);
        log("NAT termination protection disabled");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`Warning: could not disable NAT termination protection: ${msg}`, "stderr");
      // Continue — CF will fail if protection is still on, but that's non-fatal
    }
  }

  // 2. Delete the shared stack
  log(`Deleting shared infra stack ${sharedStackName}...`);
  await cfService.deleteStack(sharedStackName, { force: true });

  // 3. Wait for deletion (VPC resources can take 2-5 minutes)
  await cfService.waitForStackStatus(sharedStackName, "DELETE_COMPLETE", {
    timeoutMs: 600000, // 10 min max
  });

  log("Shared infra stack deleted successfully");
}
