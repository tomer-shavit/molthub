/**
 * Per-bot CloudFormation template generator for shared-infra mode.
 *
 * Creates a lightweight per-bot stack (~8-10 resources) that references
 * shared infrastructure via Fn::ImportValue. This replaces the full
 * ~30-resource production template when shared infra is available.
 *
 * Per-bot resources:
 * - ALB + ALB SG + Target Group + Listener(s)
 * - Task Security Group
 * - ECS Cluster + Log Group
 * - Launch Template + ASG (with warm pool) + Capacity Provider
 * - Task Definition + Task Role (per-bot least privilege)
 * - ECS Service
 * - Gateway Token Secret (optional)
 */

import { SharedExportNames } from "../shared-infra/shared-infra-config";
import { buildSysboxInstallScript } from "../../../base/startup-script-builder";

export interface PerBotTemplateParams {
  botName: string;
  gatewayPort: number;
  imageUri: string;
  usePublicImage?: boolean;
  cpu?: number;
  memory?: number;
  gatewayAuthToken: string;
  containerEnv?: Record<string, string>;
  certificateArn?: string;
  allowedCidr?: string[];
}

/** Helper to create Fn::ImportValue for a shared export */
function importShared(exportName: string): Record<string, unknown> {
  return { "Fn::ImportValue": exportName };
}

/**
 * Generate a lightweight per-bot CloudFormation template.
 * References shared VPC, subnets, and IAM roles via Fn::ImportValue.
 */
export function generatePerBotTemplate(
  params: PerBotTemplateParams,
): Record<string, unknown> {
  const {
    botName,
    gatewayPort,
    imageUri,
    usePublicImage,
    cpu = 1024,
    memory = 2048,
    gatewayAuthToken,
    containerEnv = {},
    certificateArn,
    allowedCidr = ["0.0.0.0/0"],
  } = params;

  const tag = { Key: "clawster:bot", Value: botName };

  // Build container command for public image deployments
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

  // Build UserData script with ECS agent config, warm pools, and Sysbox
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
      `echo "ECS_WARM_POOLS_CHECK=true" >> /etc/ecs/ecs.config`,
      `echo "ECS_IMAGE_PULL_BEHAVIOR=prefer-cached" >> /etc/ecs/ecs.config`,
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

  // ── Build Resources ──
  const resources: Record<string, unknown> = {};

  // ALB Security Group — allows inbound HTTP/HTTPS from allowed CIDRs
  resources.AlbSecurityGroup = {
    Type: "AWS::EC2::SecurityGroup",
    Properties: {
      GroupDescription: `Clawster ${botName} ALB security group`,
      VpcId: importShared(SharedExportNames.VpcId),
      SecurityGroupIngress: [
        ...allowedCidr.map((cidr) => ({
          IpProtocol: "tcp",
          FromPort: 80,
          ToPort: 80,
          CidrIp: cidr,
          Description: `HTTP from ${cidr}`,
        })),
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
        tag,
        { Key: "Name", Value: `clawster-${botName}-alb-sg` },
      ],
    },
  };

  // Task Security Group — allows inbound only from the ALB SG
  resources.TaskSecurityGroup = {
    Type: "AWS::EC2::SecurityGroup",
    Properties: {
      GroupDescription: `Clawster ${botName} ECS task security group`,
      VpcId: importShared(SharedExportNames.VpcId),
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
        tag,
        { Key: "Name", Value: `clawster-${botName}-task-sg` },
      ],
    },
  };

  // Application Load Balancer
  resources.Alb = {
    Type: "AWS::ElasticLoadBalancingV2::LoadBalancer",
    Properties: {
      Name: `clawster-${botName}`,
      Scheme: "internet-facing",
      Type: "application",
      Subnets: [
        importShared(SharedExportNames.PublicSubnet1),
        importShared(SharedExportNames.PublicSubnet2),
      ],
      SecurityGroups: [{ Ref: "AlbSecurityGroup" }],
      Tags: [tag],
    },
  };

  // Target Group with tuned health check
  resources.AlbTargetGroup = {
    Type: "AWS::ElasticLoadBalancingV2::TargetGroup",
    Properties: {
      Name: `clawster-${botName}-tg`,
      Port: gatewayPort,
      Protocol: "HTTP",
      VpcId: importShared(SharedExportNames.VpcId),
      TargetType: "ip",
      HealthCheckEnabled: true,
      HealthCheckPath: "/",
      HealthCheckPort: String(gatewayPort),
      HealthCheckProtocol: "HTTP",
      HealthCheckIntervalSeconds: 5,
      HealthCheckTimeoutSeconds: 3,
      HealthyThresholdCount: 2,
      UnhealthyThresholdCount: 3,
      Tags: [tag],
    },
  };

  // Listener configuration based on certificate
  let listenerDependency: string;

  if (certificateArn) {
    resources.AlbHttpsListener = {
      Type: "AWS::ElasticLoadBalancingV2::Listener",
      Properties: {
        LoadBalancerArn: { Ref: "Alb" },
        Port: 443,
        Protocol: "HTTPS",
        Certificates: [{ CertificateArn: certificateArn }],
        DefaultActions: [
          {
            Type: "forward",
            TargetGroupArn: { Ref: "AlbTargetGroup" },
          },
        ],
      },
    };
    resources.AlbHttpRedirectListener = {
      Type: "AWS::ElasticLoadBalancingV2::Listener",
      Properties: {
        LoadBalancerArn: { Ref: "Alb" },
        Port: 80,
        Protocol: "HTTP",
        DefaultActions: [
          {
            Type: "redirect",
            RedirectConfig: {
              Protocol: "HTTPS",
              Port: "443",
              StatusCode: "HTTP_301",
            },
          },
        ],
      },
    };
    listenerDependency = "AlbHttpsListener";
  } else {
    resources.AlbHttpListener = {
      Type: "AWS::ElasticLoadBalancingV2::Listener",
      Properties: {
        LoadBalancerArn: { Ref: "Alb" },
        Port: 80,
        Protocol: "HTTP",
        DefaultActions: [
          {
            Type: "forward",
            TargetGroupArn: { Ref: "AlbTargetGroup" },
          },
        ],
      },
    };
    listenerDependency = "AlbHttpListener";
  }

  // Gateway Token Secret (optional)
  if (gatewayAuthToken) {
    resources.GatewayTokenSecret = {
      Type: "AWS::SecretsManager::Secret",
      Properties: {
        Name: `clawster/${botName}/gateway-token`,
        Description: `Gateway auth token for bot "${botName}"`,
        SecretString: gatewayAuthToken,
        Tags: [tag],
      },
    };
  }

  // ECS Cluster
  resources.EcsCluster = {
    Type: "AWS::ECS::Cluster",
    Properties: {
      ClusterName: `clawster-${botName}`,
      Tags: [tag],
    },
  };

  // CloudWatch Log Group
  resources.LogGroup = {
    Type: "AWS::Logs::LogGroup",
    Properties: {
      LogGroupName: `/ecs/clawster-${botName}`,
      RetentionInDays: 30,
      Tags: [tag],
    },
  };

  // EC2 Launch Template — uses shared instance profile
  resources.LaunchTemplate = {
    Type: "AWS::EC2::LaunchTemplate",
    Properties: {
      LaunchTemplateName: `clawster-${botName}-lt`,
      LaunchTemplateData: {
        ImageId: { Ref: "LatestEcsAmiId" },
        InstanceType: "t3.small",
        IamInstanceProfile: {
          Arn: importShared(SharedExportNames.Ec2InstanceProfileArn),
        },
        SecurityGroupIds: [{ Ref: "TaskSecurityGroup" }],
        UserData: userData,
        TagSpecifications: [
          {
            ResourceType: "instance",
            Tags: [
              tag,
              { Key: "Name", Value: `clawster-${botName}` },
            ],
          },
        ],
      },
    },
  };

  // Auto Scaling Group — uses shared private subnets
  resources.AutoScalingGroup = {
    Type: "AWS::AutoScaling::AutoScalingGroup",
    Properties: {
      AutoScalingGroupName: `clawster-${botName}-asg`,
      LaunchTemplate: {
        LaunchTemplateId: { Ref: "LaunchTemplate" },
        Version: { "Fn::GetAtt": ["LaunchTemplate", "LatestVersionNumber"] },
      },
      MinSize: 0,
      MaxSize: 1,
      DesiredCapacity: 0,
      VPCZoneIdentifier: [
        importShared(SharedExportNames.PrivateSubnet1),
        importShared(SharedExportNames.PrivateSubnet2),
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
  };

  // Warm Pool for fast scale-out (~30s vs 3-5 min cold boot)
  resources.WarmPool = {
    Type: "AWS::AutoScaling::WarmPool",
    Properties: {
      AutoScalingGroupName: { Ref: "AutoScalingGroup" },
      PoolState: "Stopped",
      MinSize: 0,
      MaxGroupPreparedCapacity: 1,
    },
  };

  // ECS Capacity Provider
  resources.EcsCapacityProvider = {
    Type: "AWS::ECS::CapacityProvider",
    Properties: {
      Name: `clawster-${botName}-cp`,
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
  };

  resources.ClusterCapacityProviderAssociation = {
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
  };

  // Task Role (per-bot — empty for least privilege)
  resources.TaskRole = {
    Type: "AWS::IAM::Role",
    Properties: {
      RoleName: `clawster-${botName}-task`,
      AssumeRolePolicyDocument: {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Service: "ecs-tasks.amazonaws.com" },
            Action: "sts:AssumeRole",
          },
        ],
      },
      Tags: [tag],
    },
  };

  // Task Definition — uses shared execution role + per-bot task role
  resources.TaskDefinition = {
    Type: "AWS::ECS::TaskDefinition",
    Properties: {
      Family: `clawster-${botName}`,
      Cpu: String(cpu),
      Memory: String(memory),
      NetworkMode: "awsvpc",
      RequiresCompatibilities: ["EC2"],
      ExecutionRoleArn: importShared(SharedExportNames.TaskExecutionRoleArn),
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
                "Fn::Sub": `arn:aws:secretsmanager:\${AWS::Region}:\${AWS::AccountId}:secret:clawster/${botName}/config`,
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
              "awslogs-group": `/ecs/clawster-${botName}`,
              "awslogs-region": { Ref: "AWS::Region" },
              "awslogs-stream-prefix": "ecs",
            },
          },
        },
      ],
      Tags: [tag],
    },
  };

  // ECS Service — uses shared private subnets
  resources.EcsService = {
    Type: "AWS::ECS::Service",
    DependsOn: [listenerDependency, "ClusterCapacityProviderAssociation"],
    Properties: {
      ServiceName: `clawster-${botName}`,
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
            importShared(SharedExportNames.PrivateSubnet1),
            importShared(SharedExportNames.PrivateSubnet2),
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
  };

  return {
    AWSTemplateFormatVersion: "2010-09-09",
    Description: `Clawster per-bot ECS stack for "${botName}" (shared infra mode)`,

    Parameters: {
      LatestEcsAmiId: {
        Type: "AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>",
        Default: "/aws/service/ecs/optimized-ami/amazon-linux-2023/recommended/image_id",
        Description: "Latest ECS-optimized AMI (auto-resolved via SSM)",
      },
    },

    Resources: resources,

    Outputs: {
      AlbDnsName: {
        Description: "Application Load Balancer DNS name",
        Value: { "Fn::GetAtt": ["Alb", "DNSName"] },
      },
      ClusterName: {
        Description: "ECS Cluster name",
        Value: { Ref: "EcsCluster" },
      },
      ServiceName: {
        Description: "ECS Service name",
        Value: { "Fn::GetAtt": ["EcsService", "Name"] },
      },
      TaskDefinitionArn: {
        Description: "Task Definition ARN",
        Value: { Ref: "TaskDefinition" },
      },
      SecurityGroupId: {
        Description: "Task Security Group ID",
        Value: { Ref: "TaskSecurityGroup" },
      },
      LogGroupName: {
        Description: "CloudWatch Log Group name",
        Value: { Ref: "LogGroup" },
      },
      AlbArn: {
        Description: "Application Load Balancer ARN",
        Value: { Ref: "Alb" },
      },
    },
  };
}
