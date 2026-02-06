/**
 * CloudFormation template generator for Shared ECS EC2 infrastructure.
 *
 * Creates the shared resources that are reused across all bot deployments
 * in a region. This stack is created once and provides VPC, NAT Instance,
 * and IAM roles via CloudFormation cross-stack exports.
 *
 * Stack name: clawster-shared-{region}
 *
 * Shared resources:
 * - VPC with public/private subnets across 2 AZs
 * - NAT Instance (t4g.nano) for private subnet outbound connectivity (~$7/mo)
 * - VPC Flow Logs (REJECT-only, forensics for untrusted AI agent traffic)
 * - EC2 instance role + instance profile
 * - Task execution role (ECR pull + secrets read + logs push)
 */

import { buildSharedVpcResources } from "./shared-vpc-template";
import { buildSharedNatResources } from "./shared-nat-template";
import { buildSharedFlowLogResources } from "./shared-flow-logs-template";
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

    Parameters: {
      NatAmiId: {
        Type: "AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>",
        Default:
          "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64",
        Description: "Amazon Linux 2023 arm64 AMI for NAT Instance (auto-resolved via SSM)",
      },
    },

    Resources: {
      // Networking — VPC, Subnets, Gateways, Route Tables
      ...buildSharedVpcResources(),

      // NAT Instance — replaces VPC endpoints ($7/mo vs $117/mo)
      ...buildSharedNatResources(),

      // VPC Flow Logs — REJECT-only forensics
      ...buildSharedFlowLogResources(),

      // IAM Roles (EC2 instance role, task execution role)
      ...buildSharedIamResources(),
    },

    Outputs: buildSharedOutputs(),
  };
}
