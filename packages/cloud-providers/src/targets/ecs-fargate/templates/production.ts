/**
 * CloudFormation template generator for Production ECS EC2 deployments.
 *
 * Creates a production-ready EC2-backed ECS setup (~$66/mo) with a dedicated VPC,
 * public/private subnets across 2 AZs, NAT Gateway, Application Load Balancer,
 * and optional HTTPS termination. EC2 launch type enables Docker socket mounting
 * for sandbox isolation. Suitable for production bots requiring high availability,
 * private networking, and TLS.
 */

export interface ProductionTemplateParams {
  botName: string;
  gatewayPort: number;
  imageUri: string;
  usePublicImage?: boolean;
  cpu?: number;
  memory?: number;
  gatewayAuthToken: string;
  containerEnv?: Record<string, string>;
  certificateArn?: string;
}

export function generateProductionTemplate(
  params: ProductionTemplateParams,
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
  } = params;

  // When using a public base image, install OpenClaw + Docker CLI at container
  // startup.  docker.io is required for sandbox isolation (tool execution in
  // isolated containers).  The Docker socket is mounted from the EC2 host.
  const command = usePublicImage
    ? ["sh", "-c", [
        `apt-get update && apt-get install -y git docker.io`,
        `npm install -g openclaw@latest`,
        `mkdir -p ~/.openclaw`,
        `if [ -n "$OPENCLAW_CONFIG" ]; then printenv OPENCLAW_CONFIG > ~/.openclaw/openclaw.json; fi`,
        `chmod 666 /var/run/docker.sock 2>/dev/null || true`,
        `exec openclaw gateway --port ${gatewayPort} --allow-unconfigured`,
      ].join(" && ")]
    : undefined;

  const tag = { Key: "clawster:bot", Value: botName };

  // Build container environment variables
  const environment: Array<{ Name: string; Value: string }> = [
    { Name: "OPENCLAW_GATEWAY_PORT", Value: String(gatewayPort) },
    { Name: "OPENCLAW_PROFILE", Value: botName },
    ...Object.entries(containerEnv).map(([Name, Value]) => ({
      Name,
      Value,
    })),
  ];

  // Base64-encoded UserData script that configures the ECS agent on first boot
  const userData = Buffer.from(
    [
      `#!/bin/bash`,
      `echo "ECS_CLUSTER=clawster-${botName}" >> /etc/ecs/ecs.config`,
      `echo "ECS_ENABLE_TASK_IAM_ROLE=true" >> /etc/ecs/ecs.config`,
      `echo "ECS_ENABLE_TASK_ENI=true" >> /etc/ecs/ecs.config`,
    ].join("\n"),
  ).toString("base64");

  // ── ALB Listener configuration ──
  // If a certificate ARN is provided, create HTTPS on 443 + HTTP redirect.
  // Otherwise, create a plain HTTP listener on 80.
  const listenerResources: Record<string, unknown> = {};
  if (certificateArn) {
    listenerResources.AlbHttpsListener = {
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
    listenerResources.AlbHttpRedirectListener = {
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
  } else {
    listenerResources.AlbHttpListener = {
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
  }

  // Determine which listener the ECS service depends on
  const listenerDependency = certificateArn
    ? "AlbHttpsListener"
    : "AlbHttpListener";

  return {
    AWSTemplateFormatVersion: "2010-09-09",
    Description: `Clawster Production ECS stack for bot "${botName}"`,

    Parameters: {
      LatestEcsAmiId: {
        Type: "AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>",
        Default: "/aws/service/ecs/optimized-ami/amazon-linux-2023/recommended/image_id",
        Description: "Latest ECS-optimized AMI (auto-resolved via SSM)",
      },
    },

    Resources: {
      // ================================================================
      // Networking — VPC, Subnets, Gateways, Route Tables
      // ================================================================

      // ── VPC ──
      Vpc: {
        Type: "AWS::EC2::VPC",
        Properties: {
          CidrBlock: "10.0.0.0/16",
          EnableDnsSupport: true,
          EnableDnsHostnames: true,
          Tags: [
            { ...tag },
            { Key: "Name", Value: { "Fn::Sub": `clawster-${botName}-vpc` } },
          ],
        },
      },

      // ── Internet Gateway ──
      InternetGateway: {
        Type: "AWS::EC2::InternetGateway",
        Properties: {
          Tags: [
            { ...tag },
            {
              Key: "Name",
              Value: { "Fn::Sub": `clawster-${botName}-igw` },
            },
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
            { ...tag },
            {
              Key: "Name",
              Value: { "Fn::Sub": `clawster-${botName}-public-1` },
            },
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
            { ...tag },
            {
              Key: "Name",
              Value: { "Fn::Sub": `clawster-${botName}-public-2` },
            },
          ],
        },
      },

      // ── Public Route Table ──
      PublicRouteTable: {
        Type: "AWS::EC2::RouteTable",
        Properties: {
          VpcId: { Ref: "Vpc" },
          Tags: [
            { ...tag },
            {
              Key: "Name",
              Value: { "Fn::Sub": `clawster-${botName}-public-rt` },
            },
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
            { ...tag },
            {
              Key: "Name",
              Value: { "Fn::Sub": `clawster-${botName}-private-1` },
            },
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
            { ...tag },
            {
              Key: "Name",
              Value: { "Fn::Sub": `clawster-${botName}-private-2` },
            },
          ],
        },
      },

      // ── NAT Gateway (single AZ to save cost) ──
      NatEip: {
        Type: "AWS::EC2::EIP",
        DependsOn: ["VpcGatewayAttachment"],
        Properties: {
          Domain: "vpc",
          Tags: [
            { ...tag },
            {
              Key: "Name",
              Value: { "Fn::Sub": `clawster-${botName}-nat-eip` },
            },
          ],
        },
      },
      NatGateway: {
        Type: "AWS::EC2::NatGateway",
        Properties: {
          AllocationId: { "Fn::GetAtt": ["NatEip", "AllocationId"] },
          SubnetId: { Ref: "PublicSubnet1" },
          Tags: [
            { ...tag },
            {
              Key: "Name",
              Value: { "Fn::Sub": `clawster-${botName}-nat` },
            },
          ],
        },
      },

      // ── Private Route Table ──
      PrivateRouteTable: {
        Type: "AWS::EC2::RouteTable",
        Properties: {
          VpcId: { Ref: "Vpc" },
          Tags: [
            { ...tag },
            {
              Key: "Name",
              Value: { "Fn::Sub": `clawster-${botName}-private-rt` },
            },
          ],
        },
      },
      PrivateRoute: {
        Type: "AWS::EC2::Route",
        Properties: {
          RouteTableId: { Ref: "PrivateRouteTable" },
          DestinationCidrBlock: "0.0.0.0/0",
          NatGatewayId: { Ref: "NatGateway" },
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

      // ================================================================
      // ECS Cluster, CloudWatch
      // ================================================================

      EcsCluster: {
        Type: "AWS::ECS::Cluster",
        Properties: {
          ClusterName: { "Fn::Sub": `clawster-${botName}` },
          Tags: [tag],
        },
      },

      LogGroup: {
        Type: "AWS::Logs::LogGroup",
        Properties: {
          LogGroupName: { "Fn::Sub": `/ecs/clawster-${botName}` },
          RetentionInDays: 30,
          Tags: [tag],
        },
      },

      // ================================================================
      // IAM Roles
      // ================================================================

      // ── EC2 Instance Role (ECS agent, CloudWatch, SSM) ──
      Ec2InstanceRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: { "Fn::Sub": `clawster-${botName}-ec2` },
          AssumeRolePolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { Service: "ec2.amazonaws.com" },
                Action: "sts:AssumeRole",
              },
            ],
          },
          ManagedPolicyArns: [
            "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role",
            "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
          ],
          Tags: [tag],
        },
      },
      Ec2InstanceProfile: {
        Type: "AWS::IAM::InstanceProfile",
        Properties: {
          Roles: [{ Ref: "Ec2InstanceRole" }],
        },
      },

      // ── Task Execution Role (pull images, read secrets, push logs) ──
      TaskExecutionRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: { "Fn::Sub": `clawster-${botName}-exec` },
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
          ManagedPolicyArns: [
            "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
          ],
          Policies: [
            {
              PolicyName: "SecretsManagerRead",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Effect: "Allow",
                    Action: ["secretsmanager:GetSecretValue"],
                    Resource: {
                      "Fn::Sub":
                        `arn:aws:secretsmanager:\${AWS::Region}:\${AWS::AccountId}:secret:clawster/${botName}/*`,
                    },
                  },
                ],
              },
            },
          ],
          Tags: [tag],
        },
      },

      // ── Task Role (empty — least privilege) ──
      TaskRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: { "Fn::Sub": `clawster-${botName}-task` },
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
      },

      // ================================================================
      // Security Groups
      // ================================================================

      // ALB Security Group — allows inbound HTTP/HTTPS from the internet
      AlbSecurityGroup: {
        Type: "AWS::EC2::SecurityGroup",
        Properties: {
          GroupDescription: {
            "Fn::Sub": `Clawster ${botName} ALB security group`,
          },
          VpcId: { Ref: "Vpc" },
          SecurityGroupIngress: [
            {
              IpProtocol: "tcp",
              FromPort: 80,
              ToPort: 80,
              CidrIp: "0.0.0.0/0",
              Description: "HTTP",
            },
            {
              IpProtocol: "tcp",
              FromPort: 443,
              ToPort: 443,
              CidrIp: "0.0.0.0/0",
              Description: "HTTPS",
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
            {
              Key: "Name",
              Value: { "Fn::Sub": `clawster-${botName}-alb-sg` },
            },
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
            {
              Key: "Name",
              Value: { "Fn::Sub": `clawster-${botName}-task-sg` },
            },
          ],
        },
      },

      // ================================================================
      // Application Load Balancer
      // ================================================================

      Alb: {
        Type: "AWS::ElasticLoadBalancingV2::LoadBalancer",
        Properties: {
          Name: { "Fn::Sub": `clawster-${botName}` },
          Scheme: "internet-facing",
          Type: "application",
          Subnets: [{ Ref: "PublicSubnet1" }, { Ref: "PublicSubnet2" }],
          SecurityGroups: [{ Ref: "AlbSecurityGroup" }],
          Tags: [tag],
        },
      },

      AlbTargetGroup: {
        Type: "AWS::ElasticLoadBalancingV2::TargetGroup",
        Properties: {
          Name: { "Fn::Sub": `clawster-${botName}-tg` },
          Port: gatewayPort,
          Protocol: "HTTP",
          VpcId: { Ref: "Vpc" },
          TargetType: "ip",
          HealthCheckEnabled: true,
          HealthCheckPath: "/",
          HealthCheckPort: String(gatewayPort),
          HealthCheckProtocol: "HTTP",
          HealthCheckIntervalSeconds: 60,
          HealthCheckTimeoutSeconds: 5,
          HealthyThresholdCount: 2,
          UnhealthyThresholdCount: 5,
          Tags: [tag],
        },
      },

      // Spread listener resources (conditional on certificateArn)
      ...listenerResources,

      // ── Gateway Token Secret ──
      ...(gatewayAuthToken
        ? {
            GatewayTokenSecret: {
              Type: "AWS::SecretsManager::Secret",
              Properties: {
                Name: { "Fn::Sub": `clawster/${botName}/gateway-token` },
                Description: {
                  "Fn::Sub": `Gateway auth token for bot "${botName}"`,
                },
                SecretString: gatewayAuthToken,
                Tags: [tag],
              },
            },
          }
        : {}),

      // ================================================================
      // EC2 Auto Scaling for ECS
      // ================================================================

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
                  {
                    Key: "Name",
                    Value: { "Fn::Sub": `clawster-${botName}` },
                  },
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

      // ================================================================
      // ECS Task Definition & Service
      // ================================================================

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
    },

    Outputs: {
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
      VpcId: {
        Description: "VPC ID",
        Value: { Ref: "Vpc" },
      },
      AlbDnsName: {
        Description: "Application Load Balancer DNS name",
        Value: { "Fn::GetAtt": ["Alb", "DNSName"] },
      },
      AlbArn: {
        Description: "Application Load Balancer ARN",
        Value: { Ref: "Alb" },
      },
    },
  };
}
