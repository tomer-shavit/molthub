/**
 * Shared VPC CloudFormation resources builder.
 *
 * Creates the core networking infrastructure shared across all bots:
 * - VPC with DNS support
 * - Internet Gateway
 * - Public subnets (2 AZs) with public IPs
 * - Private subnets (2 AZs) without NAT (uses VPC endpoints)
 * - Route tables and associations
 *
 * Adapted from the per-bot vpc-template.ts with `clawster-shared` naming.
 */

import type { CloudFormationResources } from "../../templates/types";

const SHARED_TAG = { Key: "clawster:shared", Value: "true" };

/**
 * Builds shared VPC, subnets, internet gateway, and route table resources.
 *
 * @param vpcCidr - The VPC CIDR block (default: "10.0.0.0/16")
 * @returns CloudFormation resources for shared VPC infrastructure
 */
export function buildSharedVpcResources(
  vpcCidr: string = "10.0.0.0/16",
): CloudFormationResources {
  return {
    // ── VPC ──
    Vpc: {
      Type: "AWS::EC2::VPC",
      Properties: {
        CidrBlock: vpcCidr,
        EnableDnsSupport: true,
        EnableDnsHostnames: true,
        Tags: [
          SHARED_TAG,
          { Key: "Name", Value: "clawster-shared-vpc" },
        ],
      },
    },

    // ── Internet Gateway ──
    InternetGateway: {
      Type: "AWS::EC2::InternetGateway",
      Properties: {
        Tags: [
          SHARED_TAG,
          { Key: "Name", Value: "clawster-shared-igw" },
        ],
      },
    },
    VpcGatewayAttachment: {
      Type: "AWS::EC2::VPCGatewayAttachment",
      Properties: {
        VpcId: { Ref: "Vpc" },
        InternetGatewayId: { Ref: "InternetGateway" },
      },
    },

    // ── Public Subnets ──
    PublicSubnet1: {
      Type: "AWS::EC2::Subnet",
      Properties: {
        VpcId: { Ref: "Vpc" },
        CidrBlock: "10.0.1.0/24",
        AvailabilityZone: {
          "Fn::Select": [0, { "Fn::GetAZs": { Ref: "AWS::Region" } }],
        },
        MapPublicIpOnLaunch: true,
        Tags: [
          SHARED_TAG,
          { Key: "Name", Value: "clawster-shared-public-1" },
        ],
      },
    },
    PublicSubnet2: {
      Type: "AWS::EC2::Subnet",
      Properties: {
        VpcId: { Ref: "Vpc" },
        CidrBlock: "10.0.2.0/24",
        AvailabilityZone: {
          "Fn::Select": [1, { "Fn::GetAZs": { Ref: "AWS::Region" } }],
        },
        MapPublicIpOnLaunch: true,
        Tags: [
          SHARED_TAG,
          { Key: "Name", Value: "clawster-shared-public-2" },
        ],
      },
    },

    // ── Public Route Table ──
    PublicRouteTable: {
      Type: "AWS::EC2::RouteTable",
      Properties: {
        VpcId: { Ref: "Vpc" },
        Tags: [
          SHARED_TAG,
          { Key: "Name", Value: "clawster-shared-public-rt" },
        ],
      },
    },
    PublicRoute: {
      Type: "AWS::EC2::Route",
      DependsOn: ["VpcGatewayAttachment"],
      Properties: {
        RouteTableId: { Ref: "PublicRouteTable" },
        DestinationCidrBlock: "0.0.0.0/0",
        GatewayId: { Ref: "InternetGateway" },
      },
    },
    PublicSubnet1RouteTableAssoc: {
      Type: "AWS::EC2::SubnetRouteTableAssociation",
      Properties: {
        SubnetId: { Ref: "PublicSubnet1" },
        RouteTableId: { Ref: "PublicRouteTable" },
      },
    },
    PublicSubnet2RouteTableAssoc: {
      Type: "AWS::EC2::SubnetRouteTableAssociation",
      Properties: {
        SubnetId: { Ref: "PublicSubnet2" },
        RouteTableId: { Ref: "PublicRouteTable" },
      },
    },

    // ── Private Subnets ──
    PrivateSubnet1: {
      Type: "AWS::EC2::Subnet",
      Properties: {
        VpcId: { Ref: "Vpc" },
        CidrBlock: "10.0.10.0/24",
        AvailabilityZone: {
          "Fn::Select": [0, { "Fn::GetAZs": { Ref: "AWS::Region" } }],
        },
        Tags: [
          SHARED_TAG,
          { Key: "Name", Value: "clawster-shared-private-1" },
        ],
      },
    },
    PrivateSubnet2: {
      Type: "AWS::EC2::Subnet",
      Properties: {
        VpcId: { Ref: "Vpc" },
        CidrBlock: "10.0.11.0/24",
        AvailabilityZone: {
          "Fn::Select": [1, { "Fn::GetAZs": { Ref: "AWS::Region" } }],
        },
        Tags: [
          SHARED_TAG,
          { Key: "Name", Value: "clawster-shared-private-2" },
        ],
      },
    },

    // ── Private Route Table (no NAT - uses VPC endpoints) ──
    PrivateRouteTable: {
      Type: "AWS::EC2::RouteTable",
      Properties: {
        VpcId: { Ref: "Vpc" },
        Tags: [
          SHARED_TAG,
          { Key: "Name", Value: "clawster-shared-private-rt" },
        ],
      },
    },
    PrivateSubnet1RouteTableAssoc: {
      Type: "AWS::EC2::SubnetRouteTableAssociation",
      Properties: {
        SubnetId: { Ref: "PrivateSubnet1" },
        RouteTableId: { Ref: "PrivateRouteTable" },
      },
    },
    PrivateSubnet2RouteTableAssoc: {
      Type: "AWS::EC2::SubnetRouteTableAssociation",
      Properties: {
        SubnetId: { Ref: "PrivateSubnet2" },
        RouteTableId: { Ref: "PrivateRouteTable" },
      },
    },
  };
}
