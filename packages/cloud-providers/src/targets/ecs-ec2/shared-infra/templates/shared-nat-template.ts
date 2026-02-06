/**
 * Shared NAT Instance CloudFormation resources builder.
 *
 * Replaces VPC endpoints ($117/mo) with a single NAT Instance ($7/mo).
 * The NAT Instance provides outbound internet for private subnets via
 * iptables masquerade. All AWS API traffic (ECR, CloudWatch, Secrets Manager)
 * routes through NAT — standard HTTPS, encrypted end-to-end.
 *
 * Resources:
 * - NAT Security Group (TCP 80/443 from VPC CIDR)
 * - NAT Instance (t4g.nano, AL2023 arm64, SourceDestCheck=false)
 * - Elastic IP (attached directly to instance)
 * - Private route (0.0.0.0/0 → NAT Instance)
 * - CloudWatch auto-recovery alarm (StatusCheckFailed_System)
 */

import type { CloudFormationResources } from "../../templates/types";
import { SHARED_TAG, VPC_CIDR } from "../shared-infra-config";

/**
 * Builds shared NAT Instance resources for private subnet outbound connectivity.
 *
 * @param vpcCidr - The VPC CIDR block for NAT SG ingress (default: "10.0.0.0/16")
 * @returns CloudFormation resources for NAT Instance infrastructure
 */
export function buildSharedNatResources(
  vpcCidr: string = VPC_CIDR,
): CloudFormationResources {
  return {
    // ── NAT Instance Security Group ──
    NatSecurityGroup: {
      Type: "AWS::EC2::SecurityGroup",
      Properties: {
        GroupDescription: "Clawster shared NAT instance security group",
        VpcId: { Ref: "Vpc" },
        SecurityGroupIngress: [
          {
            IpProtocol: "tcp",
            FromPort: 80,
            ToPort: 80,
            CidrIp: vpcCidr,
            Description: "HTTP from VPC (NAT forwarding)",
          },
          {
            IpProtocol: "tcp",
            FromPort: 443,
            ToPort: 443,
            CidrIp: vpcCidr,
            Description: "HTTPS from VPC (NAT forwarding)",
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
          SHARED_TAG,
          { Key: "Name", Value: "clawster-shared-nat-sg" },
        ],
      },
    },

    // ── NAT Instance (t4g.nano, AL2023 arm64) ──
    NatInstance: {
      Type: "AWS::EC2::Instance",
      DependsOn: ["VpcGatewayAttachment"],
      Properties: {
        InstanceType: "t4g.nano",
        ImageId: { Ref: "NatAmiId" },
        SubnetId: { Ref: "PublicSubnet1" },
        SecurityGroupIds: [{ Ref: "NatSecurityGroup" }],
        SourceDestCheck: false,
        DisableApiTermination: true,
        UserData: {
          "Fn::Base64": [
            "#!/bin/bash",
            "set -euo pipefail",
            "",
            "# Install iptables (AL2023 uses nftables backend via iptables-nft)",
            "yum install -y iptables-services",
            "systemctl enable iptables",
            "systemctl start iptables",
            "",
            "# Enable IP forwarding (persists across reboots)",
            "echo 'net.ipv4.ip_forward=1' > /etc/sysctl.d/nat.conf",
            "sysctl -p /etc/sysctl.d/nat.conf",
            "",
            "# Detect primary network interface",
            "IFACE=$(ip route get 1.1.1.1 | sed -n 's/.*dev \\([^ ]*\\).*/\\1/p')",
            "",
            "# Configure NAT masquerade",
            "iptables -t nat -A POSTROUTING -o \"$IFACE\" -j MASQUERADE",
            "",
            "# Explicitly set FORWARD policy to ACCEPT before flushing",
            "iptables -P FORWARD ACCEPT",
            "iptables -F FORWARD",
            "",
            "# Save rules to persist across reboots",
            "service iptables save",
          ].join("\n"),
        },
        Tags: [
          SHARED_TAG,
          { Key: "Name", Value: "clawster-shared-nat" },
        ],
      },
    },

    // ── Elastic IP for NAT Instance ──
    NatElasticIp: {
      Type: "AWS::EC2::EIP",
      Properties: {
        Domain: "vpc",
        InstanceId: { Ref: "NatInstance" },
        Tags: [
          SHARED_TAG,
          { Key: "Name", Value: "clawster-shared-nat-eip" },
        ],
      },
    },

    // ── Private route → NAT Instance ──
    PrivateNatRoute: {
      Type: "AWS::EC2::Route",
      Properties: {
        RouteTableId: { Ref: "PrivateRouteTable" },
        DestinationCidrBlock: "0.0.0.0/0",
        InstanceId: { Ref: "NatInstance" },
      },
    },

    // ── CloudWatch auto-recovery alarm ──
    NatRecoveryAlarm: {
      Type: "AWS::CloudWatch::Alarm",
      Properties: {
        AlarmName: "clawster-shared-nat-recovery",
        AlarmDescription:
          "Auto-recover NAT instance on system status check failure",
        Namespace: "AWS/EC2",
        MetricName: "StatusCheckFailed_System",
        Dimensions: [
          {
            Name: "InstanceId",
            Value: { Ref: "NatInstance" },
          },
        ],
        Statistic: "Maximum",
        Period: 60,
        EvaluationPeriods: 2,
        Threshold: 1,
        ComparisonOperator: "GreaterThanOrEqualToThreshold",
        AlarmActions: [
          {
            "Fn::Sub":
              "arn:aws:automate:${AWS::Region}:ec2:recover",
          },
        ],
        Tags: [SHARED_TAG],
      },
    },
  };
}
