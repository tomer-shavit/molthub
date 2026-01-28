import { InstanceManifest } from "@molthub/core";

/**
 * Represents a container instance running on a cloud provider
 */
export interface ContainerInstance {
  id: string;
  name: string;
  status: ContainerStatus;
  health: ContainerHealth;
  provider: CloudProviderType;
  region: string;
  endpoint?: string;
  publicIp?: string;
  privateIp?: string;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, string>;
}

export type ContainerStatus = 
  | "CREATING"
  | "RUNNING"
  | "STOPPED"
  | "DELETING"
  | "ERROR"
  | "PENDING"
  | "DEGRADED";

export type ContainerHealth = 
  | "HEALTHY"
  | "UNHEALTHY"
  | "UNKNOWN";

/**
 * Configuration for deploying a container
 */
export interface ContainerDeploymentConfig {
  name: string;
  image: string;
  cpu: number;       // CPU units (vCPU)
  memory: number;    // Memory in MB
  replicas: number;
  command?: string[];
  environment: Record<string, string>;
  secrets: Record<string, string>;
  ports?: PortMapping[];
  labels: Record<string, string>;
}

export interface PortMapping {
  containerPort: number;
  hostPort?: number;
  protocol: "tcp" | "udp";
}

/**
 * Cloud resource information returned after bootstrap
 */
export interface CloudResources {
  provider: CloudProviderType;
  region: string;
  clusterId: string;
  clusterEndpoint?: string;
  network: NetworkConfig;
  iam: IAMConfig;
  logging: LoggingConfig;
  metadata: Record<string, unknown>;
}

export interface NetworkConfig {
  vpcId?: string;
  subnetIds: string[];
  securityGroupId?: string;
  publicSubnetIds?: string[];
}

export interface IAMConfig {
  executionRoleArn?: string;
  taskRoleArn?: string;
  serviceAccountName?: string;
}

export interface LoggingConfig {
  logGroupName?: string;
  logDriver: string;
  logOptions: Record<string, string>;
}

/**
 * Cloud provider types supported by Molthub
 */
export type CloudProviderType = 
  | "aws"
  | "azure"
  | "gcp"
  | "digitalocean"
  | "selfhosted"
  | "simulated";

/**
 * Configuration for initializing a cloud provider
 */
export interface CloudProviderConfig {
  provider: CloudProviderType;
  region: string;
  credentials?: CloudCredentials;
  workspace: string;
  environment?: string;
}

export interface CloudCredentials {
  // AWS
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  // Azure
  clientId?: string;
  clientSecret?: string;
  tenantId?: string;
  subscriptionId?: string;
  // GCP
  projectId?: string;
  keyFile?: string;
  // DigitalOcean
  apiToken?: string;
  // Self-hosted
  dockerHost?: string;
  kubeconfig?: string;
}

/**
 * Progress callback for long-running operations
 */
export type ProgressCallback = (step: string, status: "pending" | "in_progress" | "complete" | "error", message?: string) => void;

/**
 * Abstract interface for cloud provider implementations
 */
export interface CloudProvider {
  readonly type: CloudProviderType;
  readonly region: string;
  
  /**
   * Initialize the provider with configuration
   */
  initialize(config: CloudProviderConfig): Promise<void>;
  
  /**
   * Validate that the provider is properly configured and accessible
   */
  validate(): Promise<ValidationResult>;
  
  /**
   * Bootstrap cloud infrastructure for Molthub
   */
  bootstrap(options: BootstrapOptions, onProgress?: ProgressCallback): Promise<CloudResources>;
  
  /**
   * Deploy a container instance
   */
  deployContainer(config: ContainerDeploymentConfig, manifest: InstanceManifest): Promise<ContainerInstance>;
  
  /**
   * Update an existing container
   */
  updateContainer(instanceId: string, config: Partial<ContainerDeploymentConfig>): Promise<ContainerInstance>;
  
  /**
   * Stop a container
   */
  stopContainer(instanceId: string): Promise<void>;
  
  /**
   * Start a stopped container
   */
  startContainer(instanceId: string): Promise<void>;
  
  /**
   * Delete a container
   */
  deleteContainer(instanceId: string): Promise<void>;
  
  /**
   * Get container details
   */
  getContainer(instanceId: string): Promise<ContainerInstance | null>;
  
  /**
   * List all containers
   */
  listContainers(filters?: ContainerFilters): Promise<ContainerInstance[]>;
  
  /**
   * Get container logs
   */
  getLogs(instanceId: string, options?: LogOptions): Promise<LogResult>;
  
  /**
   * Store a secret
   */
  storeSecret(name: string, value: string, metadata?: Record<string, string>): Promise<string>;
  
  /**
   * Retrieve a secret
   */
  getSecret(name: string): Promise<string | null>;
  
  /**
   * Delete a secret
   */
  deleteSecret(name: string): Promise<void>;
  
  /**
   * Get the console/dashboard URL for the provider
   */
  getConsoleUrl(resourceType?: string, resourceId?: string): string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface BootstrapOptions {
  workspace: string;
  region: string;
  createVpc?: boolean;
  vpcId?: string;
  subnetIds?: string[];
  enableLogging?: boolean;
  tags?: Record<string, string>;
}

export interface ContainerFilters {
  status?: ContainerStatus;
  workspace?: string;
  labels?: Record<string, string>;
}

export interface LogOptions {
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  follow?: boolean;
}

export interface LogResult {
  events: LogEvent[];
  nextToken?: string;
}

export interface LogEvent {
  timestamp: Date;
  message: string;
}