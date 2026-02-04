/**
 * ECS CloudFormation resources builder.
 *
 * Creates ECS resources for EC2 launch type deployments:
 * - ECS Cluster
 * - CloudWatch Log Group
 * - EC2 Launch Template with Sysbox installation
 * - Auto Scaling Group
 * - Capacity Provider
 * - Task Definition with Docker socket mount
 * - ECS Service
 */

import type { CloudFormationResources } from "./types";
import { buildSysboxInstallScript } from "../../../base/startup-script-builder";

/** Options for building ECS resources */
export interface EcsResourceOptions {
  botName: string;
  gatewayPort: number;
  imageUri: string;
  usePublicImage?: boolean;
  cpu: number;
  memory: number;
  gatewayAuthToken: string;
  containerEnv: Record<string, string>;
  listenerDependency: string;
}

/**
 * Builds ECS cluster, task definition, and service resources.
 *
 * @param options - Configuration options for ECS resources
 * @returns CloudFormation resources for ECS infrastructure
 */
export function buildEcsResources(options: EcsResourceOptions): CloudFormationResources {
  const {
    botName,
    gatewayPort,
    imageUri,
    usePublicImage,
    cpu,
    memory,
    gatewayAuthToken,
    containerEnv,
    listenerDependency,
  } = options;

  const tag = { Key: "clawster:bot", Value: botName };

  // When using a public base image, install OpenClaw + Docker CLI at container
  // startup. docker.io is required for sandbox isolation (tool execution in
  // isolated containers). The Docker socket is mounted from the EC2 host.
  const command = usePublicImage
    ? [
        "sh",
        "-c",
        [
          `apt-get update && apt-get install -y git docker.io`,
          `npm install -g openclaw@latest`,
          `mkdir -p ~/.openclaw`,
          `if [ -n "$OPENCLAW_CONFIG" ]; then printenv OPENCLAW_CONFIG > ~/.openclaw/openclaw.json; fi`,
          `chmod 660 /var/run/docker.sock 2>/dev/null || true`,
          `exec openclaw gateway --port ${gatewayPort} --allow-unconfigured`,
        ].join(" && "),
      ]
    : undefined;

  // Build container environment variables
  const environment: Array<{ Name: string; Value: string }> = [
    { Name: "OPENCLAW_GATEWAY_PORT", Value: String(gatewayPort) },
    { Name: "OPENCLAW_PROFILE", Value: botName },
    ...Object.entries(containerEnv).map(([Name, Value]) => ({
      Name,
      Value,
    })),
  ];

  // Build UserData script with ECS agent config and Sysbox installation
  const sysboxScript = buildSysboxInstallScript();
  const userData = Buffer.from(
    [
      `#!/bin/bash`,
      `set -e`,
      ``,
      `# Configure ECS agent`,
      `echo "ECS_CLUSTER=clawster-${botName}" >> /etc/ecs/ecs.config`,
      `echo "ECS_ENABLE_TASK_IAM_ROLE=true" >> /etc/ecs/ecs.config`,
      `echo "ECS_ENABLE_TASK_ENI=true" >> /etc/ecs/ecs.config`,
      ``,
      sysboxScript,
      ``,
      `# Register sysbox-runc as available runtime for ECS`,
      `if docker info --format '{{json .Runtimes}}' 2>/dev/null | grep -q 'sysbox-runc'; then`,
      `  echo 'ECS_AVAILABLE_RUNTIMES=["sysbox-runc"]' >> /etc/ecs/ecs.config`,
      `  # Restart Docker and ECS agent to pick up new runtime`,
      `  systemctl restart docker`,
      `  systemctl restart ecs`,
      `fi`,
    ].join("\n"),
  ).toString("base64");

  return {
    // ── ECS Cluster ──
    EcsCluster: {
      Type: "AWS::ECS::Cluster",
      Properties: {
        ClusterName: { "Fn::Sub": `clawster-${botName}` },
        Tags: [tag],
      },
    },

    // ── CloudWatch Log Group ──
    LogGroup: {
      Type: "AWS::Logs::LogGroup",
      Properties: {
        LogGroupName: { "Fn::Sub": `/ecs/clawster-${botName}` },
        RetentionInDays: 30,
        Tags: [tag],
      },
    },

    // ── EC2 Launch Template ──
    LaunchTemplate: {
      Type: "AWS::EC2::LaunchTemplate",
      Properties: {
        LaunchTemplateName: { "Fn::Sub": `clawster-${botName}-lt` },
        LaunchTemplateData: {
          ImageId: { Ref: "LatestEcsAmiId" },
          InstanceType: "t3.small",
          IamInstanceProfile: {
            Arn: { "Fn::GetAtt": ["Ec2InstanceProfile", "Arn"] },
          },
          SecurityGroupIds: [{ Ref: "TaskSecurityGroup" }],
          UserData: userData,
          TagSpecifications: [
            {
              ResourceType: "instance",
              Tags: [
                { ...tag },
                { Key: "Name", Value: { "Fn::Sub": `clawster-${botName}` } },
              ],
            },
          ],
        },
      },
    },

    // ── Auto Scaling Group (private subnets for production) ──
    AutoScalingGroup: {
      Type: "AWS::AutoScaling::AutoScalingGroup",
      Properties: {
        AutoScalingGroupName: { "Fn::Sub": `clawster-${botName}-asg` },
        LaunchTemplate: {
          LaunchTemplateId: { Ref: "LaunchTemplate" },
          Version: { "Fn::GetAtt": ["LaunchTemplate", "LatestVersionNumber"] },
        },
        MinSize: 0,
        MaxSize: 1,
        DesiredCapacity: 0,
        VPCZoneIdentifier: [
          { Ref: "PrivateSubnet1" },
          { Ref: "PrivateSubnet2" },
        ],
        NewInstancesProtectedFromScaleIn: true,
        Tags: [
          {
            Key: "clawster:bot",
            Value: botName,
            PropagateAtLaunch: true,
          },
        ],
      },
    },

    // ── ECS Capacity Provider (links ASG to cluster) ──
    EcsCapacityProvider: {
      Type: "AWS::ECS::CapacityProvider",
      Properties: {
        Name: { "Fn::Sub": `clawster-${botName}-cp` },
        AutoScalingGroupProvider: {
          AutoScalingGroupArn: { Ref: "AutoScalingGroup" },
          ManagedScaling: {
            Status: "ENABLED",
            TargetCapacity: 100,
            MinimumScalingStepSize: 1,
            MaximumScalingStepSize: 1,
          },
          ManagedTerminationProtection: "ENABLED",
        },
      },
    },
    ClusterCapacityProviderAssociation: {
      Type: "AWS::ECS::ClusterCapacityProviderAssociations",
      Properties: {
        Cluster: { Ref: "EcsCluster" },
        CapacityProviders: [{ Ref: "EcsCapacityProvider" }],
        DefaultCapacityProviderStrategy: [
          {
            CapacityProvider: { Ref: "EcsCapacityProvider" },
            Weight: 1,
          },
        ],
      },
    },

    // ── Task Definition ──
    TaskDefinition: {
      Type: "AWS::ECS::TaskDefinition",
      Properties: {
        Family: { "Fn::Sub": `clawster-${botName}` },
        Cpu: String(cpu),
        Memory: String(memory),
        NetworkMode: "awsvpc",
        RequiresCompatibilities: ["EC2"],
        ExecutionRoleArn: { "Fn::GetAtt": ["TaskExecutionRole", "Arn"] },
        TaskRoleArn: { "Fn::GetAtt": ["TaskRole", "Arn"] },
        Volumes: [
          {
            Name: "docker-socket",
            Host: { SourcePath: "/var/run/docker.sock" },
          },
        ],
        ContainerDefinitions: [
          {
            Name: "openclaw",
            Image: imageUri,
            ...(command ? { Command: command } : {}),
            Essential: true,
            PortMappings: [
              {
                ContainerPort: gatewayPort,
                HostPort: gatewayPort,
                Protocol: "tcp",
              },
            ],
            MountPoints: [
              {
                SourceVolume: "docker-socket",
                ContainerPath: "/var/run/docker.sock",
                ReadOnly: false,
              },
            ],
            Environment: environment,
            Secrets: [
              {
                Name: "OPENCLAW_CONFIG",
                ValueFrom: {
                  "Fn::Sub":
                    `arn:aws:secretsmanager:\${AWS::Region}:\${AWS::AccountId}:secret:clawster/${botName}/config`,
                },
              },
              ...(gatewayAuthToken
                ? [
                    {
                      Name: "OPENCLAW_GATEWAY_TOKEN",
                      ValueFrom: { Ref: "GatewayTokenSecret" },
                    },
                  ]
                : []),
            ],
            LogConfiguration: {
              LogDriver: "awslogs",
              Options: {
                "awslogs-group": {
                  "Fn::Sub": `/ecs/clawster-${botName}`,
                },
                "awslogs-region": { Ref: "AWS::Region" },
                "awslogs-stream-prefix": "ecs",
              },
            },
          },
        ],
        Tags: [tag],
      },
    },

    // ── ECS Service ──
    EcsService: {
      Type: "AWS::ECS::Service",
      DependsOn: [listenerDependency, "ClusterCapacityProviderAssociation"],
      Properties: {
        ServiceName: { "Fn::Sub": `clawster-${botName}` },
        Cluster: { Ref: "EcsCluster" },
        TaskDefinition: { Ref: "TaskDefinition" },
        DesiredCount: 0,
        CapacityProviderStrategy: [
          {
            CapacityProvider: { Ref: "EcsCapacityProvider" },
            Weight: 1,
          },
        ],
        NetworkConfiguration: {
          AwsvpcConfiguration: {
            Subnets: [
              { Ref: "PrivateSubnet1" },
              { Ref: "PrivateSubnet2" },
            ],
            SecurityGroups: [{ Ref: "TaskSecurityGroup" }],
            AssignPublicIp: "DISABLED",
          },
        },
        LoadBalancers: [
          {
            ContainerName: "openclaw",
            ContainerPort: gatewayPort,
            TargetGroupArn: { Ref: "AlbTargetGroup" },
          },
        ],
        Tags: [tag],
      },
    },
  };
}
