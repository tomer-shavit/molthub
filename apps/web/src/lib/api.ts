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
  // Moltbot-native fields
  deploymentType?: string;
  gatewayPort?: number;
  profileName?: string;
  moltbotVersion?: string;
  configHash?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
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

export interface ChannelAuthStatus {
  channelId: string;
  state: 'paired' | 'pending' | 'expired' | 'error' | 'not_started';
  qrCodeUrl?: string;
  errorMessage?: string;
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
  auditEvents?: AuditEvent[];
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

export interface DashboardMetrics {
  totalBots: number;
  totalFleets: number;
  healthyBots: number;
  degradedBots: number;
  unhealthyBots: number;
  messageVolume: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  failureRate: number;
  costPerHour: number;
  activeChangeSets: number;
  failedDeployments: number;
}

export interface DashboardHealth {
  status: "HEALTHY" | "DEGRADED" | "UNHEALTHY";
  fleetHealth: Array<{
    fleetId: string;
    fleetName: string;
    totalInstances: number;
    healthyCount: number;
    degradedCount: number;
    unhealthyCount: number;
  }>;
  recentAlerts: Array<{
    id: string;
    severity: "CRITICAL" | "WARNING" | "INFO";
    message: string;
    timestamp: string;
    resourceId?: string;
    resourceType?: string;
  }>;
}

export interface DashboardActivity {
  events: Array<{
    id: string;
    type: string;
    message: string;
    timestamp: string;
    actor: string;
    resourceId?: string;
    resourceType?: string;
  }>;
  traces: Array<{
    id: string;
    traceId: string;
    botName: string;
    name: string;
    type: string;
    status: string;
    durationMs?: number;
    timestamp: string;
  }>;
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

  // Dashboard
  async getDashboardMetrics(): Promise<DashboardMetrics> {
    return this.fetch('/dashboard/metrics');
  }

  async getDashboardHealth(): Promise<DashboardHealth> {
    return this.fetch('/dashboard/health');
  }

  async getDashboardActivity(): Promise<DashboardActivity> {
    return this.fetch('/dashboard/activity');
  }

  // Moltbot Instance Management
  async getInstanceHealth(id: string): Promise<InstanceHealth> {
    return this.fetch(`/instances/${id}/health`);
  }

  async getInstanceDrift(id: string): Promise<InstanceDrift> {
    return this.fetch(`/instances/${id}/drift`);
  }

  async reconcileInstance(id: string): Promise<void> {
    await this.fetch(`/instances/${id}/reconcile`, { method: 'POST' });
  }

  async runDiagnostics(id: string): Promise<DiagnosticsResult> {
    return this.fetch(`/instances/${id}/doctor`, { method: 'POST' });
  }

  async getInstanceConfig(id: string): Promise<{ config: Record<string, unknown>; hash: string }> {
    return this.fetch(`/instances/${id}/config`);
  }

  async applyConfig(id: string, config: string): Promise<void> {
    await this.fetch(`/instances/${id}/config`, {
      method: 'PUT',
      body: JSON.stringify({ raw: config }),
    });
  }

  async startChannelAuth(id: string, channelId: string): Promise<ChannelAuthStatus> {
    return this.fetch(`/instances/${id}/channels/${channelId}/auth`, { method: 'POST' });
  }

  async getChannelAuthStatus(id: string, channelId: string): Promise<ChannelAuthStatus> {
    return this.fetch(`/instances/${id}/channels/${channelId}/auth`);
  }

  // Onboarding
  async getOnboardingStatus(): Promise<{ hasInstances: boolean }> {
    return this.fetch('/onboarding/status');
  }

  async getOnboardingTemplates(): Promise<Array<{
    id: string;
    name: string;
    description: string;
    category: string;
    channels: Array<{ type: string; enabled: boolean; defaults: Record<string, unknown> }>;
    requiredInputs: Array<{ key: string; label: string; secret: boolean; placeholder?: string }>;
  }>> {
    return this.fetch('/onboarding/templates');
  }

  async previewOnboarding(data: {
    templateId: string;
    channels?: Array<{ type: string; config?: Record<string, unknown> }>;
    configOverrides?: Record<string, unknown>;
  }): Promise<{ config: Record<string, unknown> }> {
    return this.fetch('/onboarding/preview', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deployOnboarding(data: {
    templateId: string;
    botName: string;
    deploymentTarget: { type: string; [key: string]: any };
    channels?: Array<{ type: string; config?: Record<string, unknown> }>;
    environment?: string;
  }): Promise<{ instanceId: string; fleetId: string; status: string }> {
    return this.fetch('/onboarding/deploy', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getDeployStatus(instanceId: string): Promise<{
    instanceId: string;
    status: string;
    health: string;
    error?: string;
    steps: Array<{ name: string; status: string }>;
  }> {
    return this.fetch(`/onboarding/deploy/${instanceId}/status`);
  }
}

export const api = new ApiClient();
