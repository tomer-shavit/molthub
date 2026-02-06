/**
 * Shared VPC Flow Logs CloudFormation resources builder.
 *
 * Creates VPC Flow Logs for forensics on untrusted AI agent traffic.
 * REJECT-only to minimize cost while still detecting anomalous connections.
 *
 * Resources:
 * - CloudWatch Log Group (30-day retention)
 * - IAM Role for flow log delivery
 * - VPC Flow Log (REJECT traffic only)
 */

import type { CloudFormationResources } from "../../templates/types";
import { SHARED_TAG } from "../shared-infra-config";

/**
 * Builds shared VPC Flow Log resources.
 *
 * @returns CloudFormation resources for VPC Flow Logs
 */
export function buildSharedFlowLogResources(): CloudFormationResources {
  return {
    // ── Flow Log CloudWatch Log Group ──
    FlowLogGroup: {
      Type: "AWS::Logs::LogGroup",
      Properties: {
        LogGroupName: "/clawster/shared/vpc-flow-logs",
        RetentionInDays: 30,
        Tags: [SHARED_TAG],
      },
    },

    // ── IAM Role for Flow Log delivery (required for cloud-watch-logs destination) ──
    FlowLogRole: {
      Type: "AWS::IAM::Role",
      Properties: {
        RoleName: "clawster-shared-flow-log",
        AssumeRolePolicyDocument: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "vpc-flow-logs.amazonaws.com" },
              Action: "sts:AssumeRole",
            },
          ],
        },
        Policies: [
          {
            PolicyName: "FlowLogDelivery",
            PolicyDocument: {
              Version: "2012-10-17",
              Statement: [
                {
                  Effect: "Allow",
                  Action: [
                    "logs:CreateLogGroup",
                    "logs:CreateLogStream",
                    "logs:PutLogEvents",
                    "logs:DescribeLogGroups",
                    "logs:DescribeLogStreams",
                  ],
                  Resource: [
                    { "Fn::GetAtt": ["FlowLogGroup", "Arn"] },
                    {
                      "Fn::Join": [
                        "",
                        [{ "Fn::GetAtt": ["FlowLogGroup", "Arn"] }, ":*"],
                      ],
                    },
                  ],
                },
              ],
            },
          },
        ],
        Tags: [SHARED_TAG],
      },
    },

    // ── VPC Flow Log (REJECT only — forensics for untrusted AI agent traffic) ──
    VpcFlowLog: {
      Type: "AWS::EC2::FlowLog",
      Properties: {
        ResourceId: { Ref: "Vpc" },
        ResourceType: "VPC",
        TrafficType: "REJECT",
        LogDestinationType: "cloud-watch-logs",
        LogGroupName: { Ref: "FlowLogGroup" },
        DeliverLogsPermissionArn: { "Fn::GetAtt": ["FlowLogRole", "Arn"] },
        Tags: [SHARED_TAG],
      },
    },
  };
}
