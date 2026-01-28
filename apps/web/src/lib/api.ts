const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export interface Instance {
  id: string;
  workspaceId: string;
  name: string;
  environment: 'dev' | 'staging' | 'prod';
  tags: Record<string, string>;
  status: 'CREATING' | 'RUNNING' | 'DEGRADED' | 'STOPPED' | 'DELETING' | 'ERROR';
  desiredManifestId?: string;
  lastReconcileAt?: string;
  lastError?: string;
  ecsServiceArn?: string;
  cloudwatchLogGroup?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BotInstance {
  id: string;
  name: string;
  workspaceId: string;
  fleetId: string;
  templateId?: string;
  profileId?: string;
  status: 'CREATING' | 'PENDING' | 'RUNNING' | 'DEGRADED' | 'STOPPED' | 'PAUSED' | 'DELETING' | 'ERROR' | 'RECONCILING';
  health: 'HEALTHY' | 'UNHEALTHY' | 'UNKNOWN' | 'DEGRADED';
  desiredManifest: Record<string, unknown>;
  appliedManifestVersion?: string;
  tags: Record<string, string>;
  metadata: Record<string, unknown>;
  lastReconcileAt?: string;
  lastHealthCheckAt?: string;
  lastError?: string;
  errorCount: number;
  uptimeSeconds: number;
  restartCount: number;
  ecsClusterArn?: string;
  ecsServiceArn?: string;
  taskDefinitionArn?: string;
  cloudwatchLogGroup?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface Fleet {
  id: string;
  name: string;
  workspaceId: string;
  environment: 'dev' | 'staging' | 'prod';
  description?: string;
  status: 'ACTIVE' | 'PAUSED' | 'DRAINING' | 'ERROR';
  tags: Record<string, string>;
  ecsClusterArn?: string;
  vpcId?: string;
  privateSubnetIds: string[];
  securityGroupId?: string;
  defaultProfileId?: string;
  enforcedPolicyPackIds: string[];
  createdAt: string;
  updatedAt: string;
  _count?: { instances: number };
  instances?: BotInstance[];
}

export interface FleetHealth {
  fleetId: string;
  totalInstances: number;
  healthyCount: number;
  degradedCount: number;
  unhealthyCount: number;
  unknownCount: number;
  status: string;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  manifestTemplate: Record<string, unknown>;
  isBuiltin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ManifestVersion {
  id: string;
  instanceId: string;
  version: number;
  content: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
}

export interface ChangeSet {
  id: string;
  botInstanceId: string;
  botInstance?: BotInstance;
  changeType: string;
  description: string;
  fromManifest?: Record<string, unknown>;
  toManifest: Record<string, unknown>;
  rolloutStrategy: 'ALL' | 'PERCENTAGE' | 'CANARY';
  rolloutPercentage?: number;
  canaryInstances?: string[];
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'ROLLED_BACK';
  totalInstances: number;
  updatedInstances: number;
  failedInstances: number;
  startedAt?: string;
  completedAt?: string;
  canRollback: boolean;
  rolledBackAt?: string;
  rolledBackBy?: string;
  createdAt: string;
  createdBy: string;
}

export interface ChangeSetStatus {
  changeSetId: string;
  status: string;
  progress: {
    total: number;
    updated: number;
    failed: number;
    remaining: number;
    percentage: number;
  };
  canRollback: boolean;
}

export interface Trace {
  id: string;
  botInstanceId: string;
  botInstance?: { id: string; name: string };
  traceId: string;
  parentTraceId?: string;
  name: string;
  type: 'REQUEST' | 'TASK' | 'SKILL' | 'TOOL' | 'MODEL' | 'OTHER';
  status: 'SUCCESS' | 'ERROR' | 'PENDING';
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: Record<string, unknown>;
  metadata: Record<string, unknown>;
  tags: Record<string, unknown>;
  createdAt: string;
  children?: Trace[];
}

export interface TraceStats {
  total: number;
  success: number;
  error: number;
  pending: number;
  avgDuration: number;
  byType: Record<string, number>;
}

export interface AuditEvent {
  id: string;
  actor: string;
  action: string;
  resourceType: string;
  resourceId: string;
  diffSummary?: string;
  timestamp: string;
  metadata: Record<string, unknown>;
  workspaceId: string;
  changeSetId?: string;
}

export interface DeploymentEvent {
  id: string;
  instanceId: string;
  eventType: 'RECONCILE_START' | 'RECONCILE_SUCCESS' | 'RECONCILE_ERROR' | 'ECS_DEPLOYMENT' | 'ECS_ROLLBACK';
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface Profile {
  id: string;
  name: string;
  description: string;
  workspaceId: string;
  fleetIds: string[];
  defaults: Record<string, unknown>;
  mergeStrategy: Record<string, unknown>;
  allowInstanceOverrides: boolean;
  lockedFields: string[];
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface Overlay {
  id: string;
  name: string;
  description: string;
  workspaceId: string;
  targetType: string;
  targetSelector: Record<string, unknown>;
  overrides: Record<string, unknown>;
  priority: number;
  enabled: boolean;
  rollout?: Record<string, unknown>;
  schedule?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface PolicyPack {
  id: string;
  name: string;
  description: string;
  workspaceId?: string;
  isBuiltin: boolean;
  autoApply: boolean;
  targetWorkspaces?: string[];
  targetEnvironments?: string[];
  targetTags?: Record<string, string>;
  rules: PolicyRule[];
  isEnforced: boolean;
  priority: number;
  version: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface PolicyRule {
  id: string;
  name: string;
  description: string;
  type: 'REQUIRED' | 'FORBIDDEN' | 'LIMIT' | 'PATTERN' | 'CUSTOM';
  target: string;
  condition: Record<string, unknown>;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  message: string;
}

export interface Connector {
  id: string;
  name: string;
  description: string;
  workspaceId: string;
  type: string;
  config: Record<string, unknown>;
  status: 'ACTIVE' | 'INACTIVE' | 'ERROR' | 'PENDING';
  statusMessage?: string;
  lastTestedAt?: string;
  lastTestResult?: string;
  lastError?: string;
  isShared: boolean;
  allowedInstanceIds?: string[];
  rotationSchedule?: Record<string, unknown>;
  usageCount: number;
  lastUsedAt?: string;
  tags: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface FleetMetrics {
  totalBots: number;
  messageVolume: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  failureRate: number;
  costPerHour: number;
}

class ApiClient {
  private async fetch(path: string, options?: RequestInit) {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Instances
  async listInstances(): Promise<Instance[]> {
    return this.fetch('/instances');
  }

  async getInstance(id: string): Promise<Instance> {
    return this.fetch(`/instances/${id}`);
  }

  async createInstance(data: {
    name: string;
    environment: string;
    templateId: string;
    tags?: Record<string, string>;
  }): Promise<Instance> {
    return this.fetch('/instances', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async restartInstance(id: string): Promise<void> {
    await this.fetch(`/instances/${id}/actions/restart`, { method: 'POST' });
  }

  async stopInstance(id: string): Promise<void> {
    await this.fetch(`/instances/${id}/actions/stop`, { method: 'POST' });
  }

  async deleteInstance(id: string): Promise<void> {
    await this.fetch(`/instances/${id}`, { method: 'DELETE' });
  }

  // Bot Instances
  async listBotInstances(fleetId?: string): Promise<BotInstance[]> {
    const params = fleetId ? `?fleetId=${fleetId}` : '';
    return this.fetch(`/bot-instances${params}`);
  }

  async getBotInstance(id: string): Promise<BotInstance> {
    return this.fetch(`/bot-instances/${id}`);
  }

  async getBotInstanceMetrics(id: string, from: Date, to: Date): Promise<TraceStats> {
    return this.fetch(`/traces/stats/${id}?from=${from.toISOString()}&to=${to.toISOString()}`);
  }

  // Fleets
  async listFleets(): Promise<Fleet[]> {
    return this.fetch('/fleets');
  }

  async getFleet(id: string): Promise<Fleet> {
    return this.fetch(`/fleets/${id}`);
  }

  async getFleetHealth(id: string): Promise<FleetHealth> {
    return this.fetch(`/fleets/${id}/health`);
  }

  async createFleet(data: {
    name: string;
    environment: string;
    workspaceId: string;
    description?: string;
    tags?: Record<string, string>;
  }): Promise<Fleet> {
    return this.fetch('/fleets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Manifests
  async listManifests(instanceId: string): Promise<ManifestVersion[]> {
    return this.fetch(`/instances/${instanceId}/manifests`);
  }

  async createManifest(
    instanceId: string,
    data: { content: Record<string, unknown>; description?: string }
  ): Promise<ManifestVersion> {
    return this.fetch(`/instances/${instanceId}/manifests`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async triggerReconcile(instanceId: string): Promise<void> {
    await this.fetch(`/instances/${instanceId}/manifests/reconcile`, { method: 'POST' });
  }

  // Templates
  async listTemplates(): Promise<Template[]> {
    return this.fetch('/templates');
  }

  async getTemplate(id: string): Promise<Template> {
    return this.fetch(`/templates/${id}`);
  }

  // Change Sets
  async listChangeSets(params?: { botInstanceId?: string; status?: string }): Promise<ChangeSet[]> {
    const searchParams = new URLSearchParams();
    if (params?.botInstanceId) searchParams.set('botInstanceId', params.botInstanceId);
    if (params?.status) searchParams.set('status', params.status);
    return this.fetch(`/change-sets?${searchParams}`);
  }

  async getChangeSet(id: string): Promise<ChangeSet> {
    return this.fetch(`/change-sets/${id}`);
  }

  async getChangeSetStatus(id: string): Promise<ChangeSetStatus> {
    return this.fetch(`/change-sets/${id}/status`);
  }

  async createChangeSet(data: {
    botInstanceId: string;
    changeType: string;
    description: string;
    fromManifest?: Record<string, unknown>;
    toManifest: Record<string, unknown>;
    rolloutStrategy?: string;
    rolloutPercentage?: number;
  }): Promise<ChangeSet> {
    return this.fetch('/change-sets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async startRollout(id: string): Promise<ChangeSet> {
    return this.fetch(`/change-sets/${id}/start`, { method: 'POST' });
  }

  async rollbackChangeSet(id: string, reason: string): Promise<ChangeSet> {
    return this.fetch(`/change-sets/${id}/rollback`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  // Traces
  async listTraces(params?: {
    botInstanceId?: string;
    type?: string;
    status?: string;
    from?: Date;
    to?: Date;
    limit?: number;
  }): Promise<Trace[]> {
    const searchParams = new URLSearchParams();
    if (params?.botInstanceId) searchParams.set('botInstanceId', params.botInstanceId);
    if (params?.type) searchParams.set('type', params.type);
    if (params?.status) searchParams.set('status', params.status);
    if (params?.from) searchParams.set('from', params.from.toISOString());
    if (params?.to) searchParams.set('to', params.to.toISOString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    return this.fetch(`/traces?${searchParams}`);
  }

  async getTrace(id: string): Promise<Trace> {
    return this.fetch(`/traces/${id}`);
  }

  async getTraceByTraceId(traceId: string): Promise<Trace & { children: Trace[] }> {
    return this.fetch(`/traces/by-trace-id/${traceId}`);
  }

  async getTraceTree(traceId: string): Promise<Trace> {
    return this.fetch(`/traces/by-trace-id/${traceId}/tree`);
  }

  // Audit
  async listAuditEvents(params?: {
    instanceId?: string;
    actor?: string;
    from?: string;
    to?: string;
  }): Promise<AuditEvent[]> {
    const searchParams = new URLSearchParams();
    if (params?.instanceId) searchParams.set('instanceId', params.instanceId);
    if (params?.actor) searchParams.set('actor', params.actor);
    if (params?.from) searchParams.set('from', params.from);
    if (params?.to) searchParams.set('to', params.to);
    return this.fetch(`/audit?${searchParams}`);
  }

  // Deployment Events
  async listDeploymentEvents(instanceId: string): Promise<DeploymentEvent[]> {
    return this.fetch(`/instances/${instanceId}/events`);
  }

  // Profiles
  async listProfiles(): Promise<Profile[]> {
    return this.fetch('/profiles');
  }

  // Overlays
  async listOverlays(): Promise<Overlay[]> {
    return this.fetch('/overlays');
  }

  // Policy Packs
  async listPolicyPacks(): Promise<PolicyPack[]> {
    return this.fetch('/policy-packs');
  }

  // Connectors
  async listConnectors(): Promise<Connector[]> {
    return this.fetch('/connectors');
  }

  // Health
  async checkHealth(): Promise<{ status: string; checks: Record<string, unknown> }> {
    return this.fetch('/health');
  }

  // Metrics
  async getMetrics(): Promise<string> {
    const response = await fetch(`${API_URL}/metrics`);
    return response.text();
  }
}

export const api = new ApiClient();
