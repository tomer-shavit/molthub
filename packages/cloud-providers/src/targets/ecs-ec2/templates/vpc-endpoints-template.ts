/**
 * VPC Endpoints CloudFormation resources builder.
 *
 * Creates VPC endpoints for AWS services to enable private subnet
 * connectivity without NAT Gateway:
 * - ECR API and DKR (Docker image pulls)
 * - S3 Gateway (ECR layer downloads - free)
 * - CloudWatch Logs (container logs)
 * - Secrets Manager (config secrets)
 * - SSM (ECS Exec and parameter store)
 * - ECS endpoints (agent communication)
 */

import type { CloudFormationResources } from "./types";

/**
 * Builds VPC endpoint resources for private subnet connectivity.
 *
 * @param botName - The bot name used for resource naming and tagging
 * @returns CloudFormation resources for VPC endpoints
 */
export function buildVpcEndpointResources(botName: string): CloudFormationResources {
  const tag = { Key: "clawster:bot", Value: botName };

  return {
    // Security group for VPC endpoints
    VpcEndpointSecurityGroup: {
      Type: "AWS::EC2::SecurityGroup",
      Properties: {
        GroupDescription: {
          "Fn::Sub": `Clawster ${botName} VPC endpoint security group`,
        },
        VpcId: { Ref: "Vpc" },
        SecurityGroupIngress: [
          {
            IpProtocol: "tcp",
            FromPort: 443,
            ToPort: 443,
            CidrIp: "10.0.0.0/16",
            Description: "HTTPS from VPC",
          },
        ],
        Tags: [
          { ...tag },
          { Key: "Name", Value: { "Fn::Sub": `clawster-${botName}-vpce-sg` } },
        ],
      },
    },

    // ECR API endpoint (for ECR API calls)
    EcrApiEndpoint: {
      Type: "AWS::EC2::VPCEndpoint",
      Properties: {
        VpcId: { Ref: "Vpc" },
        ServiceName: { "Fn::Sub": "com.amazonaws.${AWS::Region}.ecr.api" },
        VpcEndpointType: "Interface",
        SubnetIds: [{ Ref: "PrivateSubnet1" }, { Ref: "PrivateSubnet2" }],
        SecurityGroupIds: [{ Ref: "VpcEndpointSecurityGroup" }],
        PrivateDnsEnabled: true,
      },
    },

    // ECR DKR endpoint (for Docker image pulls)
    EcrDkrEndpoint: {
      Type: "AWS::EC2::VPCEndpoint",
      Properties: {
        VpcId: { Ref: "Vpc" },
        ServiceName: { "Fn::Sub": "com.amazonaws.${AWS::Region}.ecr.dkr" },
        VpcEndpointType: "Interface",
        SubnetIds: [{ Ref: "PrivateSubnet1" }, { Ref: "PrivateSubnet2" }],
        SecurityGroupIds: [{ Ref: "VpcEndpointSecurityGroup" }],
        PrivateDnsEnabled: true,
      },
    },

    // S3 Gateway endpoint (for ECR layer downloads - free, no hourly charge)
    S3Endpoint: {
      Type: "AWS::EC2::VPCEndpoint",
      Properties: {
        VpcId: { Ref: "Vpc" },
        ServiceName: { "Fn::Sub": "com.amazonaws.${AWS::Region}.s3" },
        VpcEndpointType: "Gateway",
        RouteTableIds: [{ Ref: "PrivateRouteTable" }],
      },
    },

    // CloudWatch Logs endpoint (for container logs)
    LogsEndpoint: {
      Type: "AWS::EC2::VPCEndpoint",
      Properties: {
        VpcId: { Ref: "Vpc" },
        ServiceName: { "Fn::Sub": "com.amazonaws.${AWS::Region}.logs" },
        VpcEndpointType: "Interface",
        SubnetIds: [{ Ref: "PrivateSubnet1" }, { Ref: "PrivateSubnet2" }],
        SecurityGroupIds: [{ Ref: "VpcEndpointSecurityGroup" }],
        PrivateDnsEnabled: true,
      },
    },

    // Secrets Manager endpoint (for config secrets)
    SecretsManagerEndpoint: {
      Type: "AWS::EC2::VPCEndpoint",
      Properties: {
        VpcId: { Ref: "Vpc" },
        ServiceName: {
          "Fn::Sub": "com.amazonaws.${AWS::Region}.secretsmanager",
        },
        VpcEndpointType: "Interface",
        SubnetIds: [{ Ref: "PrivateSubnet1" }, { Ref: "PrivateSubnet2" }],
        SecurityGroupIds: [{ Ref: "VpcEndpointSecurityGroup" }],
        PrivateDnsEnabled: true,
      },
    },

    // SSM endpoint (for ECS Exec and parameter store)
    SsmEndpoint: {
      Type: "AWS::EC2::VPCEndpoint",
      Properties: {
        VpcId: { Ref: "Vpc" },
        ServiceName: { "Fn::Sub": "com.amazonaws.${AWS::Region}.ssm" },
        VpcEndpointType: "Interface",
        SubnetIds: [{ Ref: "PrivateSubnet1" }, { Ref: "PrivateSubnet2" }],
        SecurityGroupIds: [{ Ref: "VpcEndpointSecurityGroup" }],
        PrivateDnsEnabled: true,
      },
    },

    // ECS endpoints (for ECS agent communication)
    EcsEndpoint: {
      Type: "AWS::EC2::VPCEndpoint",
      Properties: {
        VpcId: { Ref: "Vpc" },
        ServiceName: { "Fn::Sub": "com.amazonaws.${AWS::Region}.ecs" },
        VpcEndpointType: "Interface",
        SubnetIds: [{ Ref: "PrivateSubnet1" }, { Ref: "PrivateSubnet2" }],
        SecurityGroupIds: [{ Ref: "VpcEndpointSecurityGroup" }],
        PrivateDnsEnabled: true,
      },
    },

    EcsAgentEndpoint: {
      Type: "AWS::EC2::VPCEndpoint",
      Properties: {
        VpcId: { Ref: "Vpc" },
        ServiceName: { "Fn::Sub": "com.amazonaws.${AWS::Region}.ecs-agent" },
        VpcEndpointType: "Interface",
        SubnetIds: [{ Ref: "PrivateSubnet1" }, { Ref: "PrivateSubnet2" }],
        SecurityGroupIds: [{ Ref: "VpcEndpointSecurityGroup" }],
        PrivateDnsEnabled: true,
      },
    },

    EcsTelemetryEndpoint: {
      Type: "AWS::EC2::VPCEndpoint",
      Properties: {
        VpcId: { Ref: "Vpc" },
        ServiceName: {
          "Fn::Sub": "com.amazonaws.${AWS::Region}.ecs-telemetry",
        },
        VpcEndpointType: "Interface",
        SubnetIds: [{ Ref: "PrivateSubnet1" }, { Ref: "PrivateSubnet2" }],
        SecurityGroupIds: [{ Ref: "VpcEndpointSecurityGroup" }],
        PrivateDnsEnabled: true,
      },
    },
  };
}
