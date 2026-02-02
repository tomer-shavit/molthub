import { 
  ECSClient, 
  CreateServiceCommand, 
  UpdateServiceCommand,
  DeleteServiceCommand,
  RegisterTaskDefinitionCommand,
  DeregisterTaskDefinitionCommand,
  DescribeServicesCommand,
  DescribeTaskDefinitionCommand,
  DescribeClustersCommand,
  CreateClusterCommand,
  DeleteClusterCommand,
  ListServicesCommand,
} from "@aws-sdk/client-ecs";
import { 
  EC2Client,
  CreateVpcCommand,
  CreateSubnetCommand,
  CreateSecurityGroupCommand,
  AuthorizeSecurityGroupIngressCommand,
  DescribeVpcsCommand,
  DescribeSubnetsCommand,
  DescribeSecurityGroupsCommand,
  DeleteVpcCommand,
  DeleteSubnetCommand,
  DeleteSecurityGroupCommand,
} from "@aws-sdk/client-ec2";
import {
  IAMClient,
  CreateRoleCommand,
  AttachRolePolicyCommand,
  GetRoleCommand,
  CreatePolicyCommand,
  ListAttachedRolePoliciesCommand,
} from "@aws-sdk/client-iam";
import {
  CloudWatchLogsClient,
  CreateLogGroupCommand,
  DescribeLogGroupsCommand,
  DeleteLogGroupCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  SecretsManagerClient,
  CreateSecretCommand,
  GetSecretValueCommand,
  PutSecretValueCommand,
  DeleteSecretCommand,
} from "@aws-sdk/client-secrets-manager";
import { InstanceManifest } from "@clawster/core";
import {
  CloudProvider,
  CloudProviderConfig,
  CloudProviderType,
  ContainerInstance,
  ContainerDeploymentConfig,
  ContainerStatus,
  ContainerHealth,
  CloudResources,
  BootstrapOptions,
  ValidationResult,
  ProgressCallback,
  ContainerFilters,
  LogOptions,
  LogResult,
  LogEvent,
  PortMapping,
} from "../../interface/provider";

export interface AWSProviderConfig extends CloudProviderConfig {
  credentials?: {
    accessKeyId?: string;
    secretAccessKey?: string;
    sessionToken?: string;
  };
  accountId?: string;
  vpcId?: string;
  subnetIds?: string[];
  securityGroupId?: string;
  clusterArn?: string;
  executionRoleArn?: string;
  taskRoleArn?: string;
}

export class AWSProvider implements CloudProvider {
  readonly type: CloudProviderType = "aws";
  region: string = "us-east-1";
  
  private ecsClient!: ECSClient;
  private ec2Client!: EC2Client;
  private iamClient!: IAMClient;
  private logsClient!: CloudWatchLogsClient;
  private secretsClient!: SecretsManagerClient;
  private accountId?: string;
  private workspace?: string;
  
  // Cached resources
  private vpcId?: string;
  private subnetIds: string[] = [];
  private securityGroupId?: string;
  private clusterArn?: string;
  private executionRoleArn?: string;
  private taskRoleArn?: string;

  async initialize(config: AWSProviderConfig): Promise<void> {
    this.region = config.region;
    this.workspace = config.workspace;
    this.accountId = config.accountId;
    this.vpcId = config.vpcId;
    this.subnetIds = config.subnetIds || [];
    this.securityGroupId = config.securityGroupId;
    this.clusterArn = config.clusterArn;
    this.executionRoleArn = config.executionRoleArn;
    this.taskRoleArn = config.taskRoleArn;

    const clientConfig = {
      region: this.region,
      ...(config.credentials && {
        credentials: {
          accessKeyId: config.credentials.accessKeyId || "",
          secretAccessKey: config.credentials.secretAccessKey || "",
          ...(config.credentials.sessionToken && { sessionToken: config.credentials.sessionToken }),
        },
      }),
    };

    this.ecsClient = new ECSClient(clientConfig);
    this.ec2Client = new EC2Client(clientConfig);
    this.iamClient = new IAMClient(clientConfig);
    this.logsClient = new CloudWatchLogsClient(clientConfig);
    this.secretsClient = new SecretsManagerClient(clientConfig);
  }

  async validate(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Try to list ECS clusters to validate credentials
      await this.ecsClient.send(new DescribeClustersCommand({}));
    } catch (error) {
      errors.push(`AWS credentials validation failed: ${(error as Error).message}`);
      return { valid: false, errors, warnings };
    }

    // Check if required environment variables or config are set
    if (!this.executionRoleArn) {
      warnings.push("ECS execution role ARN not set - will attempt to create during bootstrap");
    }
    if (!this.taskRoleArn) {
      warnings.push("ECS task role ARN not set - will attempt to create during bootstrap");
    }
    if (this.subnetIds.length === 0) {
      warnings.push("No subnet IDs configured - will create during bootstrap");
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  async bootstrap(options: BootstrapOptions, onProgress?: ProgressCallback): Promise<CloudResources> {
    const workspace = options.workspace;
    const tags = options.tags || { managedBy: "clawster", workspace };

    // Step 1: Create ECS Cluster
    onProgress?.("cluster", "in_progress", "Creating ECS cluster...");
    const clusterName = `clawster-${workspace}`;
    const clusterResult = await this.ecsClient.send(new CreateClusterCommand({
      clusterName,
      tags: Object.entries(tags).map(([key, value]) => ({ key, value: String(value) })),
      settings: [{ name: "containerInsights", value: "enabled" }],
    }));
    this.clusterArn = clusterResult.cluster?.clusterArn || "";
    onProgress?.("cluster", "complete", `Created ECS cluster: ${clusterName}`);

    // Step 2: Create VPC and networking (if needed)
    let vpcId = options.vpcId;
    let subnetIds = options.subnetIds || [];
    let securityGroupId = this.securityGroupId;

    if (options.createVpc || !vpcId) {
      onProgress?.("network", "in_progress", "Creating VPC and subnets...");
      const network = await this.createVPCAndSubnets(workspace, tags);
      vpcId = network.vpcId;
      subnetIds = network.subnetIds;
      securityGroupId = network.securityGroupId;
      onProgress?.("network", "complete", `Created VPC ${vpcId} with ${subnetIds.length} subnets`);
    }

    this.vpcId = vpcId;
    this.subnetIds = subnetIds;
    this.securityGroupId = securityGroupId;

    // Step 3: Create IAM roles
    onProgress?.("iam", "in_progress", "Creating IAM roles...");
    const iam = await this.createIAMRoles(workspace, tags);
    this.executionRoleArn = iam.executionRoleArn;
    this.taskRoleArn = iam.taskRoleArn;
    onProgress?.("iam", "complete", "Created IAM roles");

    // Step 4: Create CloudWatch log group
    onProgress?.("logging", "in_progress", "Creating CloudWatch log group...");
    const logGroupName = `/clawster/${workspace}`;
    try {
      await this.logsClient.send(new CreateLogGroupCommand({
        logGroupName,
        tags,
      }));
    } catch (error) {
      if ((error as Error).name !== "ResourceAlreadyExistsException") {
        throw error;
      }
    }
    onProgress?.("logging", "complete", `Created log group: ${logGroupName}`);

    // Get account ID if not set
    if (!this.accountId) {
      this.accountId = await this.getAccountId();
    }

    return {
      provider: "aws",
      region: this.region,
      clusterId: this.clusterArn,
      network: {
        vpcId: this.vpcId,
        subnetIds: this.subnetIds,
        securityGroupId: this.securityGroupId,
      },
      iam: {
        executionRoleArn: this.executionRoleArn,
        taskRoleArn: this.taskRoleArn,
      },
      logging: {
        logGroupName,
        logDriver: "awslogs",
        logOptions: {
          "awslogs-region": this.region,
          "awslogs-group": logGroupName,
        },
      },
      metadata: {
        accountId: this.accountId,
        clusterName,
      },
    };
  }

  private async createVPCAndSubnets(workspace: string, tags: Record<string, string>): Promise<{
    vpcId: string;
    subnetIds: string[];
    securityGroupId: string;
  }> {
    // Create VPC
    const vpcResult = await this.ec2Client.send(new CreateVpcCommand({
      CidrBlock: "10.0.0.0/16",
      TagSpecifications: [{
        ResourceType: "vpc",
        Tags: [
          { Key: "Name", Value: `clawster-${workspace}` },
          ...Object.entries(tags).map(([Key, Value]) => ({ Key, Value })),
        ],
      }],
    }));
    const vpcId = vpcResult.Vpc?.VpcId!;

    // Create subnets in 2 AZs
    const subnetIds: string[] = [];
    const azs = ["a", "b"];
    for (let i = 0; i < azs.length; i++) {
      const subnetResult = await this.ec2Client.send(new CreateSubnetCommand({
        VpcId: vpcId,
        CidrBlock: `10.0.${i}.0/24`,
        AvailabilityZone: `${this.region}${azs[i]}`,
        TagSpecifications: [{
          ResourceType: "subnet",
          Tags: [
            { Key: "Name", Value: `clawster-${workspace}-${azs[i]}` },
            ...Object.entries(tags).map(([Key, Value]) => ({ Key, Value })),
          ],
        }],
      }));
      if (subnetResult.Subnet?.SubnetId) {
        subnetIds.push(subnetResult.Subnet.SubnetId);
      }
    }

    // Create security group
    const sgResult = await this.ec2Client.send(new CreateSecurityGroupCommand({
      GroupName: `clawster-${workspace}`,
      Description: "Security group for Clawster ECS tasks",
      VpcId: vpcId,
      TagSpecifications: [{
        ResourceType: "security-group",
        Tags: [
          { Key: "Name", Value: `clawster-${workspace}` },
          ...Object.entries(tags).map(([Key, Value]) => ({ Key, Value })),
        ],
      }],
    }));
    const securityGroupId = sgResult.GroupId!;

    // Allow outbound traffic
    await this.ec2Client.send(new AuthorizeSecurityGroupIngressCommand({
      GroupId: securityGroupId,
      IpPermissions: [
        {
          IpProtocol: "tcp",
          FromPort: 3000,
          ToPort: 3000,
          IpRanges: [{ CidrIp: "10.0.0.0/16", Description: "Internal traffic" }],
        },
      ],
    }));

    return { vpcId, subnetIds, securityGroupId };
  }

  private async createIAMRoles(workspace: string, tags: Record<string, string>): Promise<{
    executionRoleArn: string;
    taskRoleArn: string;
  }> {
    const accountId = this.accountId || await this.getAccountId();

    // Execution role for ECS
    const executionRoleName = `clawster-${workspace}-ecs-execution`;
    const executionAssumeRolePolicy = JSON.stringify({
      Version: "2012-10-17",
      Statement: [{
        Effect: "Allow",
        Principal: { Service: "ecs-tasks.amazonaws.com" },
        Action: "sts:AssumeRole",
      }],
    });

    let executionRoleArn: string;
    try {
      const roleResult = await this.iamClient.send(new CreateRoleCommand({
        RoleName: executionRoleName,
        AssumeRolePolicyDocument: executionAssumeRolePolicy,
        Tags: Object.entries(tags).map(([Key, Value]) => ({ Key, Value })),
      }));
      executionRoleArn = roleResult.Role?.Arn!;
      
      // Attach managed policy for ECS execution
      await this.iamClient.send(new AttachRolePolicyCommand({
        RoleName: executionRoleName,
        PolicyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
      }));
    } catch (error) {
      if ((error as Error).name === "EntityAlreadyExists") {
        executionRoleArn = `arn:aws:iam::${accountId}:role/${executionRoleName}`;
      } else {
        throw error;
      }
    }

    // Task role for OpenClaw
    const taskRoleName = `clawster-${workspace}-ecs-task`;
    const taskAssumeRolePolicy = JSON.stringify({
      Version: "2012-10-17",
      Statement: [{
        Effect: "Allow",
        Principal: { Service: "ecs-tasks.amazonaws.com" },
        Action: "sts:AssumeRole",
      }],
    });

    let taskRoleArn: string;
    try {
      const roleResult = await this.iamClient.send(new CreateRoleCommand({
        RoleName: taskRoleName,
        AssumeRolePolicyDocument: taskAssumeRolePolicy,
        Tags: Object.entries(tags).map(([Key, Value]) => ({ Key, Value })),
      }));
      taskRoleArn = roleResult.Role?.Arn!;

      // Create and attach custom policy for Secrets Manager access
      const policyName = `clawster-${workspace}-secrets-access`;
      const policyDocument = JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
          Effect: "Allow",
          Action: [
            "secretsmanager:GetSecretValue",
            "secretsmanager:DescribeSecret",
          ],
          Resource: `arn:aws:secretsmanager:${this.region}:${accountId}:secret:/clawster/${workspace}/*`,
        }],
      });

      const policyResult = await this.iamClient.send(new CreatePolicyCommand({
        PolicyName: policyName,
        PolicyDocument: policyDocument,
      }));

      await this.iamClient.send(new AttachRolePolicyCommand({
        RoleName: taskRoleName,
        PolicyArn: policyResult.Policy?.Arn,
      }));
    } catch (error) {
      if ((error as Error).name === "EntityAlreadyExists") {
        taskRoleArn = `arn:aws:iam::${accountId}:role/${taskRoleName}`;
      } else {
        throw error;
      }
    }

    return { executionRoleArn, taskRoleArn };
  }

  private async getAccountId(): Promise<string> {
    // Get account ID from STS - simplified approach
    // In real implementation, would use STS GetCallerIdentity
    return process.env.AWS_ACCOUNT_ID || "000000000000";
  }

  async deployContainer(config: ContainerDeploymentConfig, manifest: InstanceManifest): Promise<ContainerInstance> {
    if (!this.clusterArn) {
      throw new Error("Cluster not initialized. Run bootstrap first.");
    }

    const family = `${this.workspace}-${config.name}`;
    
    // Create task definition
    const secretsList = Object.entries(config.secrets).map(([name, valueFrom]) => ({
      name,
      valueFrom: String(valueFrom),
    }));

    const envList = Object.entries(config.environment).map(([name, value]) => ({
      name,
      value: String(value),
    }));

    const taskDefResult = await this.ecsClient.send(new RegisterTaskDefinitionCommand({
      family,
      networkMode: "awsvpc",
      requiresCompatibilities: ["FARGATE"],
      cpu: config.cpu.toString(),
      memory: config.memory.toString(),
      executionRoleArn: this.executionRoleArn,
      taskRoleArn: this.taskRoleArn,
      containerDefinitions: [{
        name: "openclaw",
        image: config.image,
        essential: true,
        command: config.command,
        secrets: secretsList.length > 0 ? secretsList : undefined,
        environment: envList,
        logConfiguration: {
          logDriver: "awslogs",
          options: {
            "awslogs-group": `/clawster/${this.workspace}/${config.name}`,
            "awslogs-region": this.region,
            "awslogs-stream-prefix": "openclaw",
          },
        },
        portMappings: config.ports?.map((p: PortMapping) => ({
          containerPort: p.containerPort,
          protocol: p.protocol.toUpperCase() as "tcp" | "udp",
        })),
      }],
    }));

    const taskDefinitionArn = taskDefResult.taskDefinition?.taskDefinitionArn!;

    // Create service
    const serviceName = config.name;
    await this.ecsClient.send(new CreateServiceCommand({
      cluster: this.clusterArn,
      serviceName,
      taskDefinition: taskDefinitionArn,
      desiredCount: config.replicas,
      launchType: "FARGATE",
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: this.subnetIds,
          securityGroups: this.securityGroupId ? [this.securityGroupId] : undefined,
          assignPublicIp: "DISABLED",
        },
      },
      deploymentConfiguration: {
        minimumHealthyPercent: 100,
        maximumPercent: 200,
      },
      tags: Object.entries(config.labels).map(([key, value]) => ({ key, value: String(value) })),
    }));

    return {
      id: `${this.clusterArn}/${serviceName}`,
      name: serviceName,
      status: "PENDING",
      health: "UNKNOWN",
      provider: "aws",
      region: this.region,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        clusterArn: this.clusterArn,
        taskDefinitionArn,
        serviceName,
      },
    };
  }

  async updateContainer(instanceId: string, config: Partial<ContainerDeploymentConfig>): Promise<ContainerInstance> {
    const existing = await this.getContainer(instanceId);
    if (!existing) {
      throw new Error(`Container ${instanceId} not found`);
    }

    // Update service if desired count changed
    if (config.replicas !== undefined) {
      await this.ecsClient.send(new UpdateServiceCommand({
        cluster: this.clusterArn,
        service: existing.name,
        desiredCount: config.replicas,
      }));
    }

    return this.getContainer(instanceId) as Promise<ContainerInstance>;
  }

  async stopContainer(instanceId: string): Promise<void> {
    const existing = await this.getContainer(instanceId);
    if (!existing) {
      throw new Error(`Container ${instanceId} not found`);
    }

    await this.ecsClient.send(new UpdateServiceCommand({
      cluster: this.clusterArn,
      service: existing.name,
      desiredCount: 0,
    }));
  }

  async startContainer(instanceId: string): Promise<void> {
    const existing = await this.getContainer(instanceId);
    if (!existing) {
      throw new Error(`Container ${instanceId} not found`);
    }

    await this.ecsClient.send(new UpdateServiceCommand({
      cluster: this.clusterArn,
      service: existing.name,
      desiredCount: 1,
    }));
  }

  async deleteContainer(instanceId: string): Promise<void> {
    const existing = await this.getContainer(instanceId);
    if (!existing) {
      throw new Error(`Container ${instanceId} not found`);
    }

    // Scale to 0 first
    await this.stopContainer(instanceId);

    // Delete service
    await this.ecsClient.send(new DeleteServiceCommand({
      cluster: this.clusterArn,
      service: existing.name,
      force: true,
    }));

    // Deregister task definition
    const taskDefArn = existing.metadata.taskDefinitionArn;
    if (taskDefArn) {
      await this.ecsClient.send(new DeregisterTaskDefinitionCommand({
        taskDefinition: taskDefArn,
      }));
    }
  }

  async getContainer(instanceId: string): Promise<ContainerInstance | null> {
    const serviceName = instanceId.split("/").pop();
    if (!serviceName) return null;

    try {
      const result = await this.ecsClient.send(new DescribeServicesCommand({
        cluster: this.clusterArn,
        services: [serviceName],
      }));

      const service = result.services?.[0];
      if (!service) return null;

      let status: ContainerStatus = "PENDING";
      if (service.status === "ACTIVE") {
        status = service.desiredCount === 0 ? "STOPPED" : 
                 ((service.runningCount || 0) === (service.desiredCount || 0) ? "RUNNING" : "DEGRADED");
      } else if (service.status === "DRAINING") {
        status = "DELETING";
      }

      const runningCount = service.runningCount || 0;
      const desiredCount = service.desiredCount || 0;
      
      let health: ContainerHealth = "UNKNOWN";
      if (runningCount === desiredCount && desiredCount > 0) {
        health = "HEALTHY";
      } else if (runningCount < desiredCount && desiredCount > 0) {
        health = "UNHEALTHY";
      }

      return {
        id: instanceId,
        name: serviceName,
        status,
        health,
        provider: "aws",
        region: this.region,
        createdAt: service.createdAt || new Date(),
        updatedAt: new Date(),
        metadata: {
          clusterArn: this.clusterArn || "",
          serviceName,
          taskDefinitionArn: service.taskDefinition || "",
          runningCount: service.runningCount?.toString() || "0",
          pendingCount: service.pendingCount?.toString() || "0",
          desiredCount: service.desiredCount?.toString() || "0",
        },
      };
    } catch {
      return null;
    }
  }

  async listContainers(filters?: ContainerFilters): Promise<ContainerInstance[]> {
    const result = await this.ecsClient.send(new ListServicesCommand({
      cluster: this.clusterArn,
    }));

    const instances: ContainerInstance[] = [];
    for (const serviceArn of result.serviceArns || []) {
      const instance = await this.getContainer(serviceArn);
      if (instance) {
        if (filters?.status && instance.status !== filters.status) continue;
        if (filters?.workspace && instance.metadata.workspace !== filters.workspace) continue;
        instances.push(instance);
      }
    }

    return instances;
  }

  async getLogs(instanceId: string, options?: LogOptions): Promise<LogResult> {
    const instance = await this.getContainer(instanceId);
    if (!instance) {
      throw new Error(`Container ${instanceId} not found`);
    }

    const logGroupName = `/clawster/${this.workspace}/${instance.name}`;
    
    // Get log streams
    const { DescribeLogStreamsCommand, GetLogEventsCommand } = await import("@aws-sdk/client-cloudwatch-logs");
    const streamsResult = await this.logsClient.send(new DescribeLogStreamsCommand({
      logGroupName,
      orderBy: "LastEventTime",
      descending: true,
      limit: 1,
    }));

    const streamName = streamsResult.logStreams?.[0]?.logStreamName;
    if (!streamName) {
      return { events: [] };
    }

    const eventsResult = await this.logsClient.send(new GetLogEventsCommand({
      logGroupName,
      logStreamName: streamName,
      startTime: options?.startTime?.getTime(),
      endTime: options?.endTime?.getTime(),
      limit: options?.limit || 100,
    }));

    const events: LogEvent[] = eventsResult.events?.map(e => ({
      timestamp: new Date(e.timestamp || 0),
      message: e.message || "",
    })) || [];

    return { events };
  }

  async storeSecret(name: string, value: string, metadata?: Record<string, string>): Promise<string> {
    const secretName = `/clawster/${this.workspace}/${name}`;
    
    try {
      const result = await this.secretsClient.send(new CreateSecretCommand({
        Name: secretName,
        SecretString: value,
        Tags: Object.entries(metadata || {}).map(([Key, Value]) => ({ Key, Value })),
      }));
      return result.ARN || secretName;
    } catch (error) {
      if ((error as Error).name === "ResourceExistsException") {
        await this.secretsClient.send(new PutSecretValueCommand({
          SecretId: secretName,
          SecretString: value,
        }));
        const accountId = this.accountId || "000000000000";
        return `arn:aws:secretsmanager:${this.region}:${accountId}:secret:${secretName}`;
      }
      throw error;
    }
  }

  async getSecret(name: string): Promise<string | null> {
    const secretName = `/clawster/${this.workspace}/${name}`;
    
    try {
      const result = await this.secretsClient.send(new GetSecretValueCommand({
        SecretId: secretName,
      }));
      return result.SecretString || null;
    } catch (error) {
      if ((error as Error).name === "ResourceNotFoundException") {
        return null;
      }
      throw error;
    }
  }

  async deleteSecret(name: string): Promise<void> {
    const secretName = `/clawster/${this.workspace}/${name}`;
    
    await this.secretsClient.send(new DeleteSecretCommand({
      SecretId: secretName,
      ForceDeleteWithoutRecovery: true,
    }));
  }

  getConsoleUrl(resourceType?: string, resourceId?: string): string {
    const baseUrl = `https://${this.region}.console.aws.amazon.com`;
    
    if (resourceType === "cluster" && this.clusterArn) {
      return `${baseUrl}/ecs/home?region=${this.region}#/clusters/${this.clusterArn.split("/").pop()}`;
    }
    
    if (resourceType === "logs" && resourceId) {
      return `${baseUrl}/cloudwatch/home?region=${this.region}#logsV2:log-groups/log-group/${encodeURIComponent(resourceId)}`;
    }
    
    return `${baseUrl}/ecs/home?region=${this.region}`;
  }
}