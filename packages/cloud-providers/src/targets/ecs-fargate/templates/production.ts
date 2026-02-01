/**
 * CloudFormation template generator for Production ECS Fargate deployments.
 *
 * Creates a production-ready Fargate setup (~$66/mo) with a dedicated VPC,
 * public/private subnets across 2 AZs, NAT Gateway, Application Load Balancer,
 * and optional HTTPS termination. Suitable for production bots requiring high
 * availability, private networking, and TLS.
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

  // When using a public base image, install OpenClaw at container startup.
  // The OPENCLAW_CONFIG env var is injected from Secrets Manager by ECS.
  // We must write it to ~/.openclaw/openclaw.json before starting the gateway,
  // because OpenClaw reads config from disk (not from env vars).
  const command = usePublicImage
    ? ["sh", "-c", [
        `apt-get update && apt-get install -y git`,
        `npm install -g openclaw@latest`,
        `mkdir -p ~/.openclaw`,
        `if [ -n "$OPENCLAW_CONFIG" ]; then printenv OPENCLAW_CONFIG > ~/.openclaw/openclaw.json; fi`,
        `exec openclaw gateway --port ${gatewayPort} --allow-unconfigured`,
      ].join(" && ")]
    : undefined;

  const tag = { Key: "molthub:bot", Value: botName };

  // Build container environment variables
  const environment: Array<{ Name: string; Value: string }> = [
    { Name: "OPENCLAW_GATEWAY_PORT", Value: String(gatewayPort) },
    { Name: "OPENCLAW_PROFILE", Value: botName },
    ...(gatewayAuthToken
      ? [{ Name: "OPENCLAW_GATEWAY_TOKEN", Value: gatewayAuthToken }]
      : []),
    ...Object.entries(containerEnv).map(([Name, Value]) => ({
      Name,
      Value,
    })),
  ];

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
    Description: `Molthub Production ECS Fargate stack for bot "${botName}"`,

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
            { Key: "Name", Value: { "Fn::Sub": `molthub-${botName}-vpc` } },
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
              Value: { "Fn::Sub": `molthub-${botName}-igw` },
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
              Value: { "Fn::Sub": `molthub-${botName}-public-1` },
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
              Value: { "Fn::Sub": `molthub-${botName}-public-2` },
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
              Value: { "Fn::Sub": `molthub-${botName}-public-rt` },
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
              Value: { "Fn::Sub": `molthub-${botName}-private-1` },
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
              Value: { "Fn::Sub": `molthub-${botName}-private-2` },
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
              Value: { "Fn::Sub": `molthub-${botName}-nat-eip` },
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
              Value: { "Fn::Sub": `molthub-${botName}-nat` },
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
              Value: { "Fn::Sub": `molthub-${botName}-private-rt` },
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
      // ECR, ECS Cluster, CloudWatch
      // ================================================================

      EcrRepository: {
        Type: "AWS::ECR::Repository",
        Properties: {
          RepositoryName: { "Fn::Sub": `molthub/${botName}` },
          ImageScanningConfiguration: {
            ScanOnPush: true,
          },
          ImageTagMutability: "MUTABLE",
          Tags: [tag],
        },
      },

      EcsCluster: {
        Type: "AWS::ECS::Cluster",
        Properties: {
          ClusterName: { "Fn::Sub": `molthub-${botName}` },
          Tags: [tag],
        },
      },

      LogGroup: {
        Type: "AWS::Logs::LogGroup",
        Properties: {
          LogGroupName: { "Fn::Sub": `/ecs/molthub-${botName}` },
          RetentionInDays: 30,
          Tags: [tag],
        },
      },

      // ================================================================
      // IAM Roles
      // ================================================================

      TaskExecutionRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: { "Fn::Sub": `molthub-${botName}-exec` },
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
                        "arn:aws:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:molthub/*",
                    },
                  },
                ],
              },
            },
          ],
          Tags: [tag],
        },
      },

      TaskRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: { "Fn::Sub": `molthub-${botName}-task` },
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
            "Fn::Sub": `Molthub ${botName} ALB security group`,
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
              Value: { "Fn::Sub": `molthub-${botName}-alb-sg` },
            },
          ],
        },
      },

      // ECS Task Security Group — allows inbound only from the ALB SG
      TaskSecurityGroup: {
        Type: "AWS::EC2::SecurityGroup",
        Properties: {
          GroupDescription: {
            "Fn::Sub": `Molthub ${botName} ECS task security group`,
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
              Value: { "Fn::Sub": `molthub-${botName}-task-sg` },
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
          Name: { "Fn::Sub": `molthub-${botName}` },
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
          Name: { "Fn::Sub": `molthub-${botName}-tg` },
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

      // ================================================================
      // ECS Task Definition & Service
      // ================================================================

      TaskDefinition: {
        Type: "AWS::ECS::TaskDefinition",
        Properties: {
          Family: { "Fn::Sub": `molthub-${botName}` },
          Cpu: String(cpu),
          Memory: String(memory),
          NetworkMode: "awsvpc",
          RequiresCompatibilities: ["FARGATE"],
          ExecutionRoleArn: { "Fn::GetAtt": ["TaskExecutionRole", "Arn"] },
          TaskRoleArn: { "Fn::GetAtt": ["TaskRole", "Arn"] },
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
              Environment: environment,
              Secrets: [
                {
                  Name: "OPENCLAW_CONFIG",
                  ValueFrom: {
                    "Fn::Sub":
                      `arn:aws:secretsmanager:\${AWS::Region}:\${AWS::AccountId}:secret:molthub/${botName}/config`,
                  },
                },
              ],
              LogConfiguration: {
                LogDriver: "awslogs",
                Options: {
                  "awslogs-group": {
                    "Fn::Sub": `/ecs/molthub-${botName}`,
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
        DependsOn: [listenerDependency],
        Properties: {
          ServiceName: { "Fn::Sub": `molthub-${botName}` },
          Cluster: { Ref: "EcsCluster" },
          TaskDefinition: { Ref: "TaskDefinition" },
          DesiredCount: 0,
          LaunchType: "FARGATE",
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
      EcrRepositoryUri: {
        Description: "ECR Repository URI",
        Value: { "Fn::GetAtt": ["EcrRepository", "RepositoryUri"] },
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
