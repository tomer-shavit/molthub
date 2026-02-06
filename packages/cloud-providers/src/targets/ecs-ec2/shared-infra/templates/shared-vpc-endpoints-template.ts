/**
 * Shared VPC Endpoints CloudFormation resources builder.
 *
 * Creates VPC endpoints for AWS services to enable private subnet
 * connectivity without NAT Gateway (shared across all bots):
 * - ECR API and DKR (Docker image pulls)
 * - S3 Gateway (ECR layer downloads - free)
 * - CloudWatch Logs (container logs)
 * - Secrets Manager (config secrets)
 * - SSM (ECS Exec and parameter store)
 * - ECS endpoints (agent communication)
 *
 * These are the slowest resources to create (~3 min) and the primary
 * reason for sharing infrastructure across bots.
 */

import type { CloudFormationResources } from "../../templates/types";

/**
 * Builds shared VPC endpoint resources for private subnet connectivity.
 *
 * @returns CloudFormation resources for VPC endpoints
 */
export function buildSharedVpcEndpointResources(): CloudFormationResources {
  const tag = { Key: "clawster:shared", Value: "true" };

  return {
    // Security group for VPC endpoints
    VpcEndpointSecurityGroup: {
      Type: "AWS::EC2::SecurityGroup",
      Properties: {
        GroupDescription: "Clawster shared VPC endpoint security group",
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
          tag,
          { Key: "Name", Value: "clawster-shared-vpce-sg" },
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
