import type { SharedInfraIds } from "../../types";

/**
 * Manages shared AWS network infrastructure (VPC, Subnet, IGW, SG, IAM).
 *
 * All resources are tagged with `clawster:managed=true` for idempotent
 * lookup. Created once per region, shared across all bots.
 */
export interface IAwsNetworkManager {
  /**
   * Ensure all shared infrastructure exists. Idempotent — returns
   * existing resource IDs if already created.
   */
  ensureSharedInfra(): Promise<SharedInfraIds>;

  /**
   * Look up existing shared infrastructure by tags.
   * Returns null if not yet created.
   */
  getSharedInfra(): Promise<SharedInfraIds | null>;

  /**
   * Delete shared infrastructure if no ASGs reference the subnet.
   * Used during the last bot's destroy() to clean up.
   */
  deleteSharedInfraIfOrphaned(): Promise<void>;

  /**
   * Update security group rules (e.g. to add SSH access for allowedCidr).
   */
  updateSecurityGroupRules(
    sgId: string,
    rules: { port: number; cidr: string; description: string }[],
  ): Promise<void>;
}
