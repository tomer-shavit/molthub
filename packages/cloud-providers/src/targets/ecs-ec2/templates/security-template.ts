/**
 * Security Groups CloudFormation resources builder.
 *
 * Creates security groups for the ECS EC2 deployment:
 * - ALB Security Group (allows HTTP/HTTPS from allowed CIDRs)
 * - Task Security Group (allows gateway port from ALB only)
 */

import type { CloudFormationResources } from "./types";

/**
 * Builds security group resources for ALB and ECS tasks.
 *
 * @param botName - The bot name used for resource naming and tagging
 * @param gatewayPort - The OpenClaw gateway port number
 * @param allowedCidr - Array of CIDR blocks allowed to access the ALB
 * @returns CloudFormation resources for security groups
 */
export function buildSecurityGroupResources(
  botName: string,
  gatewayPort: number,
  allowedCidr: string[],
): CloudFormationResources {
  const tag = { Key: "clawster:bot", Value: botName };

  return {
    // ALB Security Group — allows inbound HTTP/HTTPS from allowed CIDRs
    AlbSecurityGroup: {
      Type: "AWS::EC2::SecurityGroup",
      Properties: {
        GroupDescription: {
          "Fn::Sub": `Clawster ${botName} ALB security group`,
        },
        VpcId: { Ref: "Vpc" },
        SecurityGroupIngress: [
          // Allow HTTP from each allowed CIDR
          ...allowedCidr.map((cidr) => ({
            IpProtocol: "tcp",
            FromPort: 80,
            ToPort: 80,
            CidrIp: cidr,
            Description: `HTTP from ${cidr}`,
          })),
          // Allow HTTPS from each allowed CIDR
          ...allowedCidr.map((cidr) => ({
            IpProtocol: "tcp",
            FromPort: 443,
            ToPort: 443,
            CidrIp: cidr,
            Description: `HTTPS from ${cidr}`,
          })),
        ],
        SecurityGroupEgress: [
          {
            IpProtocol: "-1",
            CidrIp: "0.0.0.0/0",
            Description: "All outbound traffic",
          },
        ],
        Tags: [
          { ...tag },
          { Key: "Name", Value: { "Fn::Sub": `clawster-${botName}-alb-sg` } },
        ],
      },
    },

    // ECS Task Security Group — allows inbound only from the ALB SG
    TaskSecurityGroup: {
      Type: "AWS::EC2::SecurityGroup",
      Properties: {
        GroupDescription: {
          "Fn::Sub": `Clawster ${botName} ECS task security group`,
        },
        VpcId: { Ref: "Vpc" },
        SecurityGroupIngress: [
          {
            IpProtocol: "tcp",
            FromPort: gatewayPort,
            ToPort: gatewayPort,
            SourceSecurityGroupId: { Ref: "AlbSecurityGroup" },
            Description: "OpenClaw gateway port from ALB",
          },
        ],
        SecurityGroupEgress: [
          {
            IpProtocol: "-1",
            CidrIp: "0.0.0.0/0",
            Description: "All outbound traffic",
          },
        ],
        Tags: [
          { ...tag },
          { Key: "Name", Value: { "Fn::Sub": `clawster-${botName}-task-sg` } },
        ],
      },
    },
  };
}
