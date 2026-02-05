/**
 * Bot instance types.
 */

export type BotInstanceStatus = 'CREATING' | 'PENDING' | 'RUNNING' | 'DEGRADED' | 'STOPPED' | 'PAUSED' | 'DELETING' | 'ERROR' | 'RECONCILING';
export type BotHealth = 'HEALTHY' | 'UNHEALTHY' | 'UNKNOWN' | 'DEGRADED';
export type ResourceTier = 'light' | 'standard' | 'performance' | 'custom';

export interface BotInstance {
  id: string;
  name: string;
  workspaceId: string;
  fleetId: string;
  templateId?: string;
  profileId?: string;
  status: BotInstanceStatus;
  health: BotHealth;
  desiredManifest: Record<string, unknown>;
  appliedManifestVersion?: string;
  tags: Record<string, string>;
  metadata: Record<string, unknown>;
  lastReconcileAt?: string;
  lastHealthCheckAt?: string;
  lastError?: string;
  errorCount: number;
  runningSince?: string;
  restartCount: number;
  fleet?: { id: string; name: string; environment: string };
  deploymentTarget?: { id: string; name: string; type: string };
  deploymentType?: string;
  gatewayPort?: number;
  profileName?: string;
  openclawVersion?: string;
  configHash?: string;
  aiGatewayEnabled: boolean;
  aiGatewayUrl?: string;
  aiGatewayApiKey?: string;
  aiGatewayProvider: string;
  gatewayConnection?: {
    host: string;
    port: number;
    status: string;
    authToken?: string;
  };
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface AiGatewaySettings {
  enabled: boolean;
  providerName?: string;
  gatewayUrl?: string;
  gatewayApiKey?: string;
}

export interface BotResourcesResponse {
  tier: ResourceTier;
  cpu: number;
  memory: number;
  dataDiskSizeGb?: number;
  deploymentType: string;
}

export interface UpdateBotResourcesPayload {
  tier: ResourceTier;
  cpu?: number;
  memory?: number;
  dataDiskSizeGb?: number;
}

export interface BotResourcesUpdateResult {
  success: boolean;
  message: string;
  requiresRestart?: boolean;
}

export interface InstanceHealth {
  overall: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  components: Array<{
    name: string;
    status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
    message?: string;
  }>;
  lastChecked?: string;
}

export interface InstanceDrift {
  hasDrift: boolean;
  currentConfig: Record<string, unknown>;
  desiredConfig: Record<string, unknown>;
  differences: Array<{
    path: string;
    current: unknown;
    desired: unknown;
  }>;
}

export interface DiagnosticsResult {
  status: 'pass' | 'fail' | 'warn';
  checks: Array<{
    name: string;
    status: 'pass' | 'fail' | 'warn';
    message: string;
    details?: Record<string, unknown>;
  }>;
  timestamp: string;
}

export interface BotComparison {
  instances: BotInstance[];
}

export interface BulkActionPayload {
  instanceIds: string[];
  action: "restart" | "pause" | "stop" | "start";
}

export interface BulkActionResult {
  instanceId: string;
  success: boolean;
  error?: string;
}

export interface ListBotInstancesParams {
  fleetId?: string;
}

export interface DeploymentEvent {
  id: string;
  instanceId: string;
  eventType: 'RECONCILE_START' | 'RECONCILE_SUCCESS' | 'RECONCILE_ERROR' | 'ECS_DEPLOYMENT' | 'ECS_ROLLBACK';
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ProvisioningStatus {
  instanceId: string;
  status: string;
  steps: Array<{
    id: string;
    name: string;
    status: string;
    startedAt?: string;
    completedAt?: string;
    error?: string;
    message?: string;
  }>;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}
