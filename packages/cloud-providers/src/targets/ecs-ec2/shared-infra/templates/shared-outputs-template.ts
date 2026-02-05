/**
 * Shared infrastructure CloudFormation Outputs builder.
 *
 * Defines all Fn::Export values that per-bot stacks consume
 * via Fn::ImportValue. These exports are the contract between
 * the shared stack and per-bot stacks.
 */

import { SharedExportNames } from "../shared-infra-config";

/**
 * Builds CloudFormation Outputs section with exports for cross-stack references.
 *
 * @returns CloudFormation Outputs object with Export names
 */
export function buildSharedOutputs(): Record<string, unknown> {
  return {
    VpcId: {
      Description: "Shared VPC ID",
      Value: { Ref: "Vpc" },
      Export: { Name: SharedExportNames.VpcId },
    },
    PublicSubnet1Id: {
      Description: "Public subnet 1 ID",
      Value: { Ref: "PublicSubnet1" },
      Export: { Name: SharedExportNames.PublicSubnet1 },
    },
    PublicSubnet2Id: {
      Description: "Public subnet 2 ID",
      Value: { Ref: "PublicSubnet2" },
      Export: { Name: SharedExportNames.PublicSubnet2 },
    },
    PrivateSubnet1Id: {
      Description: "Private subnet 1 ID",
      Value: { Ref: "PrivateSubnet1" },
      Export: { Name: SharedExportNames.PrivateSubnet1 },
    },
    PrivateSubnet2Id: {
      Description: "Private subnet 2 ID",
      Value: { Ref: "PrivateSubnet2" },
      Export: { Name: SharedExportNames.PrivateSubnet2 },
    },
    PrivateRouteTableId: {
      Description: "Private route table ID",
      Value: { Ref: "PrivateRouteTable" },
      Export: { Name: SharedExportNames.PrivateRouteTable },
    },
    VpcEndpointSecurityGroupId: {
      Description: "VPC endpoint security group ID",
      Value: { Ref: "VpcEndpointSecurityGroup" },
      Export: { Name: SharedExportNames.VpcEndpointSecurityGroupId },
    },
    Ec2InstanceProfileArn: {
      Description: "EC2 instance profile ARN",
      Value: { "Fn::GetAtt": ["Ec2InstanceProfile", "Arn"] },
      Export: { Name: SharedExportNames.Ec2InstanceProfileArn },
    },
    TaskExecutionRoleArn: {
      Description: "Task execution role ARN",
      Value: { "Fn::GetAtt": ["TaskExecutionRole", "Arn"] },
      Export: { Name: SharedExportNames.TaskExecutionRoleArn },
    },
  };
}
