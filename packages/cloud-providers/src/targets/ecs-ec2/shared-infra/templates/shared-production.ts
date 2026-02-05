/**
 * CloudFormation template generator for Shared ECS EC2 infrastructure.
 *
 * Creates the shared resources that are reused across all bot deployments
 * in a region. This stack is created once and provides VPC, VPC endpoints,
 * and IAM roles via CloudFormation cross-stack exports.
 *
 * Stack name: clawster-shared-{region}
 *
 * Shared resources:
 * - VPC with public/private subnets across 2 AZs
 * - 9 VPC endpoints (the main deployment bottleneck - ~3 min)
 * - EC2 instance role + instance profile
 * - Task execution role (ECR pull + secrets read + logs push)
 */

import { buildSharedVpcResources } from "./shared-vpc-template";
import { buildSharedVpcEndpointResources } from "./shared-vpc-endpoints-template";
import { buildSharedIamResources } from "./shared-iam-template";
import { buildSharedOutputs } from "./shared-outputs-template";

/**
 * Generate the full CloudFormation template for shared infrastructure.
 *
 * @returns Complete CloudFormation template object
 */
export function generateSharedInfraTemplate(): Record<string, unknown> {
  return {
    AWSTemplateFormatVersion: "2010-09-09",
    Description: "Clawster shared infrastructure for ECS EC2 bot deployments",

    Resources: {
      // Networking — VPC, Subnets, Gateways, Route Tables
      ...buildSharedVpcResources(),

      // VPC Endpoints (the main bottleneck — ~3 min, created once)
      ...buildSharedVpcEndpointResources(),

      // IAM Roles (EC2 instance role, task execution role)
      ...buildSharedIamResources(),
    },

    Outputs: buildSharedOutputs(),
  };
}
