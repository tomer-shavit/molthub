const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

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
  runningSince?: string;
  restartCount: number;
  // Relations
  fleet?: { id: string; name: string; environment: string };
  deploymentTarget?: { id: string; name: string; type: string };
  // OpenClaw-native fields
  deploymentType?: string;
  gatewayPort?: number;
  profileName?: string;
  openclawVersion?: string;
  configHash?: string;
  // AI Gateway settings
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

export type ResourceTier = 'light' | 'standard' | 'performance' | 'custom';

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
  defaultProfileId?: string;
  createdAt: string;
  updatedAt: string;
  _count?: { instances: number };
  instances?: BotInstance[];
}

export interface PromoteFleetResult {
  fleet: Fleet;
  botsReconciling: number;
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

export interface TemplateRequiredInput {
  key: string;
  label: string;
  envVar: string;
  configPath: string;
  secret: boolean;
  placeholder?: string;
}

export interface TemplateChannelPreset {
  type: string;
  enabled: boolean;
  defaults: Record<string, unknown>;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  defaultConfig: Record<string, unknown>;
  manifestTemplate: Record<string, unknown>;
  isBuiltin: boolean;
  requiredInputs?: TemplateRequiredInput[];
  channels?: TemplateChannelPreset[];
  recommendedPolicies?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemplatePayload {
  name: string;
  description: string;
  category: string;
  defaultConfig: Record<string, unknown>;
  channels?: Array<{ type: string; enabled: boolean; defaults: Record<string, unknown> }>;
  recommendedPolicies?: string[];
  manifestTemplate?: Record<string, unknown>;
}

export interface TemplateConfigPreview {
  config: Record<string, unknown>;
  secretRefs: Record<string, string>;
}

export interface CreateProfilePayload {
  workspaceId: string;
  name: string;
  description: string;
  fleetIds?: string[];
  defaults: Record<string, unknown>;
  mergeStrategy?: Record<string, "override" | "merge" | "prepend" | "append">;
  allowInstanceOverrides?: boolean;
  lockedFields?: string[];
  priority?: number;
  createdBy?: string;
}

export interface UpdateProfilePayload {
  name?: string;
  description?: string;
  fleetIds?: string[];
  defaults?: Record<string, unknown>;
  mergeStrategy?: Record<string, "override" | "merge" | "prepend" | "append">;
  allowInstanceOverrides?: boolean;
  lockedFields?: string[];
  priority?: number;
  isActive?: boolean;
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

export interface ChannelBinding {
  id: string;
  channelType: string;
  status: "active" | "inactive" | "error";
  config?: Record<string, unknown>;
}

export type SloMetric = 'UPTIME' | 'LATENCY_P50' | 'LATENCY_P95' | 'LATENCY_P99' | 'ERROR_RATE' | 'CHANNEL_HEALTH';

export type SloWindow = 'ROLLING_1H' | 'ROLLING_24H' | 'ROLLING_7D' | 'ROLLING_30D' | 'CALENDAR_DAY' | 'CALENDAR_WEEK' | 'CALENDAR_MONTH';

export interface SloDefinition {
  id: string;
  instanceId: string;
  name: string;
  description?: string;
  metric: SloMetric;
  targetValue: number;
  window: SloWindow;
  currentValue?: number;
  isBreached: boolean;
  breachedAt?: string;
  breachCount: number;
  lastEvaluatedAt?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  instance?: {
    id: string;
    name: string;
    status: string;
    health: string;
  };
}

export interface SloSummary {
  total: number;
  breached: number;
  healthy: number;
  compliancePercent: number;
}

export interface CreateSloPayload {
  name: string;
  description?: string;
  instanceId: string;
  metric: SloMetric;
  targetValue: number;
  window: SloWindow;
}

export interface UserContextResponse {
  agentCount: number;
  hasFleets: boolean;
  hasTeams: boolean;
  stage: 'empty' | 'getting-started' | 'fleet';
}

class ApiClient {
  private async fetch(path: string, options?: RequestInit) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options?.headers as Record<string, string>,
    };

    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const body = await response.json();
        message = body.message || message;
      } catch {
        // If not JSON, use status text only
      }
      throw new Error(message);
    }

    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return undefined;
    }

    return response.json();
  }

  // Bot Instances
  async listBotInstances(params?: { fleetId?: string }): Promise<BotInstance[]> {
    const searchParams = new URLSearchParams();
    if (params?.fleetId) searchParams.set('fleetId', params.fleetId);
    const query = searchParams.toString();
    return this.fetch(`/bot-instances${query ? `?${query}` : ''}`);
  }

  async getBotInstance(id: string): Promise<BotInstance> {
    return this.fetch(`/bot-instances/${id}`);
  }

  async deleteBotInstance(id: string): Promise<void> {
    await this.fetch(`/bot-instances/${id}`, { method: 'DELETE' });
  }

  async stopBotInstance(id: string): Promise<void> {
    await this.fetch(`/bot-instances/${id}/stop`, { method: 'POST' });
  }

  async startBotInstance(id: string): Promise<void> {
    await this.fetch(`/bot-instances/${id}/resume`, { method: 'POST' });
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
    workspaceId?: string;
    description?: string;
    tags?: Record<string, string>;
  }): Promise<Fleet> {
    return this.fetch('/fleets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async promoteFleet(id: string, targetEnvironment: string): Promise<PromoteFleetResult> {
    return this.fetch(`/fleets/${id}/promote`, {
      method: 'POST',
      body: JSON.stringify({ targetEnvironment }),
    });
  }

  async reconcileAllFleet(id: string): Promise<{ queued: number; skipped: number }> {
    return this.fetch(`/fleets/${id}/reconcile-all`, { method: 'POST' });
  }

  // Templates
  async listTemplates(): Promise<Template[]> {
    return this.fetch('/templates');
  }

  async getTemplate(id: string): Promise<Template> {
    return this.fetch(`/templates/${id}`);
  }

  async createTemplate(data: CreateTemplatePayload): Promise<Template> {
    return this.fetch('/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async previewTemplateConfig(id: string, data: {
    values?: Record<string, string>;
    configOverrides?: Record<string, unknown>;
  }): Promise<TemplateConfigPreview> {
    return this.fetch(`/templates/${id}/preview`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
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
    return this.fetch(`/bot-instances/${instanceId}/events`);
  }

  // Profiles
  async listProfiles(params?: { workspaceId?: string; fleetId?: string; isActive?: boolean }): Promise<Profile[]> {
    const searchParams = new URLSearchParams();
    if (params?.workspaceId) searchParams.set('workspaceId', params.workspaceId);
    if (params?.fleetId) searchParams.set('fleetId', params.fleetId);
    if (params?.isActive !== undefined) searchParams.set('isActive', String(params.isActive));
    const query = searchParams.toString();
    return this.fetch(`/profiles${query ? `?${query}` : ''}`);
  }

  async getProfile(id: string): Promise<Profile> {
    return this.fetch(`/profiles/${id}`);
  }

  async createProfile(data: CreateProfilePayload): Promise<Profile> {
    return this.fetch('/profiles', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateProfile(id: string, data: UpdateProfilePayload): Promise<Profile> {
    return this.fetch(`/profiles/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteProfile(id: string): Promise<void> {
    await this.fetch(`/profiles/${id}`, { method: 'DELETE' });
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

  // OpenClaw Instance Management
  async getInstanceHealth(id: string): Promise<InstanceHealth> {
    return this.fetch(`/bot-instances/${id}/health`);
  }

  async getInstanceDrift(id: string): Promise<InstanceDrift> {
    return this.fetch(`/bot-instances/${id}/drift`);
  }

  async reconcileInstance(id: string): Promise<void> {
    await this.fetch(`/bot-instances/${id}/reconcile`, { method: 'POST' });
  }

  async runDiagnostics(id: string): Promise<DiagnosticsResult> {
    return this.fetch(`/bot-instances/${id}/doctor`, { method: 'POST' });
  }

  async getInstanceConfig(id: string): Promise<{ config: Record<string, unknown>; hash: string }> {
    return this.fetch(`/bot-instances/${id}/config`);
  }

  async applyConfig(id: string, config: string): Promise<void> {
    await this.fetch(`/bot-instances/${id}/config`, {
      method: 'PUT',
      body: JSON.stringify({ raw: config }),
    });
  }

  async patchBotConfig(instanceId: string, patch: Record<string, unknown>): Promise<BotInstance> {
    return this.fetch(`/bot-instances/${instanceId}/config`, {
      method: 'PATCH',
      body: JSON.stringify({ patch }),
    });
  }

  async startChannelAuth(id: string, channelId: string): Promise<ChannelAuthStatus> {
    return this.fetch(`/bot-instances/${id}/channels/${channelId}/auth`, { method: 'POST' });
  }

  async getChannelAuthStatus(id: string, channelId: string): Promise<ChannelAuthStatus> {
    return this.fetch(`/bot-instances/${id}/channels/${channelId}/auth`);
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
    templateId?: string;
    botName: string;
    deploymentTarget: { type: string; [key: string]: unknown };
    channels?: Array<{ type: string; config?: Record<string, unknown> }>;
    environment?: string;
    modelConfig?: { provider: string; model: string; apiKey: string };
    fleetId?: string;
    awsCredentialId?: string;
    modelCredentialId?: string;
  }): Promise<{ instanceId: string; fleetId: string; status: string }> {
    return this.fetch('/onboarding/deploy', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async validateAwsCredentials(data: {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
  }): Promise<{ valid: boolean; accountId?: string; error?: string }> {
    return this.fetch('/onboarding/validate-aws', {
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

  // ============================================
  // Credential Vault
  // ============================================

  async saveCredential(data: {
    name: string;
    type: 'aws-account' | 'api-key';
    credentials: Record<string, unknown>;
  }): Promise<{ id: string; name: string; type: string; maskedConfig: Record<string, string>; createdAt: string }> {
    return this.fetch('/credential-vault', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async listSavedCredentials(type?: string): Promise<Array<{ id: string; name: string; type: string; maskedConfig: Record<string, string>; createdAt: string }>> {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    const qs = params.toString();
    return this.fetch(`/credential-vault${qs ? `?${qs}` : ''}`);
  }

  async deleteSavedCredential(id: string): Promise<void> {
    return this.fetch(`/credential-vault/${id}`, { method: 'DELETE' });
  }

  async getProvisioningStatus(instanceId: string): Promise<{
    instanceId: string;
    status: string;
    steps: Array<{id: string; name: string; status: string; startedAt?: string; completedAt?: string; error?: string; message?: string}>;
    startedAt?: string;
    completedAt?: string;
    error?: string;
  }> {
    return this.fetch(`/bot-instances/${instanceId}/provisioning/status`);
  }

  // Multi-Bot UX
  async compareBots(ids: string[]): Promise<BotInstance[]> {
    return this.fetch('/bot-instances/compare', {
      method: 'POST',
      body: JSON.stringify({ instanceIds: ids }),
    });
  }

  async bulkAction(data: BulkActionPayload): Promise<BulkActionResult[]> {
    return this.fetch('/bot-instances/bulk-action', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ============================================
  // Costs
  // ============================================

  async listCostEvents(filters?: {
    instanceId?: string;
    provider?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedCostEvents> {
    const params = new URLSearchParams();
    if (filters?.instanceId) params.set('instanceId', filters.instanceId);
    if (filters?.provider) params.set('provider', filters.provider);
    if (filters?.from) params.set('from', filters.from);
    if (filters?.to) params.set('to', filters.to);
    if (filters?.page) params.set('page', filters.page.toString());
    if (filters?.limit) params.set('limit', filters.limit.toString());
    return this.fetch(`/costs/events?${params}`);
  }

  async recordCostEvent(data: CreateCostEventPayload): Promise<CostEvent> {
    return this.fetch('/costs/events', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getCostSummary(filters?: {
    instanceId?: string;
    from?: string;
    to?: string;
  }): Promise<CostSummary> {
    const params = new URLSearchParams();
    if (filters?.instanceId) params.set('instanceId', filters.instanceId);
    if (filters?.from) params.set('from', filters.from);
    if (filters?.to) params.set('to', filters.to);
    return this.fetch(`/costs/summary?${params}`);
  }

  async getInstanceCosts(instanceId: string): Promise<CostSummary> {
    return this.fetch(`/costs/instance/${instanceId}`);
  }

  // ============================================
  // Budgets
  // ============================================

  async listBudgets(filters?: {
    instanceId?: string;
    fleetId?: string;
    isActive?: boolean;
  }): Promise<BudgetConfig[]> {
    const params = new URLSearchParams();
    if (filters?.instanceId) params.set('instanceId', filters.instanceId);
    if (filters?.fleetId) params.set('fleetId', filters.fleetId);
    if (filters?.isActive !== undefined) params.set('isActive', String(filters.isActive));
    return this.fetch(`/budgets?${params}`);
  }

  async createBudget(data: CreateBudgetPayload): Promise<BudgetConfig> {
    return this.fetch('/budgets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateBudget(id: string, data: Partial<CreateBudgetPayload> & { isActive?: boolean }): Promise<BudgetConfig> {
    return this.fetch(`/budgets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteBudget(id: string): Promise<void> {
    await this.fetch(`/budgets/${id}`, { method: 'DELETE' });
  }

  // ============================================
  // SLOs
  // ============================================

  async listSlos(filters?: {
    instanceId?: string;
    isBreached?: boolean;
    isActive?: boolean;
  }): Promise<SloDefinition[]> {
    const params = new URLSearchParams();
    if (filters?.instanceId) params.set('instanceId', filters.instanceId);
    if (filters?.isBreached !== undefined) params.set('isBreached', String(filters.isBreached));
    if (filters?.isActive !== undefined) params.set('isActive', String(filters.isActive));
    return this.fetch(`/slos?${params}`);
  }

  async getSlo(id: string): Promise<SloDefinition> {
    return this.fetch(`/slos/${id}`);
  }

  async createSlo(data: CreateSloPayload): Promise<SloDefinition> {
    return this.fetch('/slos', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateSlo(id: string, data: Partial<CreateSloPayload> & { isActive?: boolean }): Promise<SloDefinition> {
    return this.fetch(`/slos/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteSlo(id: string): Promise<void> {
    await this.fetch(`/slos/${id}`, { method: 'DELETE' });
  }

  async getSloSummary(): Promise<SloSummary> {
    return this.fetch('/slos/summary');
  }

  // ============================================
  // Alerts
  // ============================================

  async listAlerts(filters?: {
    instanceId?: string;
    fleetId?: string;
    severity?: HealthAlertSeverity;
    status?: HealthAlertStatus;
    rule?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedAlerts> {
    const params = new URLSearchParams();
    if (filters?.instanceId) params.set('instanceId', filters.instanceId);
    if (filters?.fleetId) params.set('fleetId', filters.fleetId);
    if (filters?.severity) params.set('severity', filters.severity);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.rule) params.set('rule', filters.rule);
    if (filters?.from) params.set('from', filters.from);
    if (filters?.to) params.set('to', filters.to);
    if (filters?.page) params.set('page', filters.page.toString());
    if (filters?.limit) params.set('limit', filters.limit.toString());
    return this.fetch(`/alerts?${params}`);
  }

  async getAlert(alertId: string): Promise<HealthAlert> {
    return this.fetch(`/alerts/${alertId}`);
  }

  async acknowledgeAlert(alertId: string, data?: { acknowledgedBy?: string }): Promise<HealthAlert> {
    return this.fetch(`/alerts/${alertId}/acknowledge`, {
      method: 'POST',
      body: JSON.stringify(data ?? {}),
    });
  }

  async resolveAlert(alertId: string): Promise<HealthAlert> {
    return this.fetch(`/alerts/${alertId}/resolve`, { method: 'POST' });
  }

  async suppressAlert(alertId: string): Promise<HealthAlert> {
    return this.fetch(`/alerts/${alertId}/suppress`, { method: 'POST' });
  }

  async remediateAlert(alertId: string): Promise<RemediationResult> {
    return this.fetch(`/alerts/${alertId}/remediate`, { method: 'POST' });
  }

  async bulkAcknowledgeAlerts(ids: string[], acknowledgedBy?: string): Promise<{ updated: number }> {
    return this.fetch('/alerts/bulk-acknowledge', {
      method: 'POST',
      body: JSON.stringify({ ids, acknowledgedBy }),
    });
  }

  async bulkResolveAlerts(ids: string[]): Promise<{ updated: number }> {
    return this.fetch('/alerts/bulk-resolve', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  }

  async getAlertSummary(): Promise<AlertSummary> {
    return this.fetch('/alerts/summary');
  }

  async getActiveAlertCount(): Promise<{ count: number }> {
    return this.fetch('/alerts/active-count');
  }

  // ============================================
  // Debug / Introspection
  // ============================================

  async debugGetProcesses(instanceId: string): Promise<DebugProcessInfo[]> {
    return this.fetch(`/bot-instances/${instanceId}/debug/processes`);
  }

  async debugProbeGateway(instanceId: string): Promise<DebugGatewayProbeResult> {
    return this.fetch(`/bot-instances/${instanceId}/debug/gateway-probe`);
  }

  async debugGetConfig(instanceId: string): Promise<DebugRedactedConfig> {
    return this.fetch(`/bot-instances/${instanceId}/debug/config`);
  }

  async debugGetEnvStatus(instanceId: string): Promise<DebugEnvVarStatus[]> {
    return this.fetch(`/bot-instances/${instanceId}/debug/env`);
  }

  async debugGetStateFiles(instanceId: string): Promise<DebugFileInfo[]> {
    return this.fetch(`/bot-instances/${instanceId}/debug/state-files`);
  }

  async debugTestConnectivity(instanceId: string): Promise<DebugConnectivityResult> {
    return this.fetch(`/bot-instances/${instanceId}/debug/connectivity`);
  }

  // User Context
  async getUserContext(): Promise<UserContextResponse> {
    return this.fetch('/user-context');
  }

  // ============================================
  // Agent Evolution
  // ============================================

  async getLiveState(instanceId: string): Promise<AgentLiveState> {
    return this.fetch(`/bot-instances/${instanceId}/live-state`);
  }

  async getEvolution(instanceId: string): Promise<AgentEvolutionSnapshot> {
    return this.fetch(`/bot-instances/${instanceId}/evolution`);
  }

  async getEvolutionHistory(instanceId: string, limit = 50): Promise<{ snapshots: AgentEvolutionSnapshot[] }> {
    return this.fetch(`/bot-instances/${instanceId}/evolution/history?limit=${limit}`);
  }

  async syncEvolution(instanceId: string): Promise<AgentEvolutionSnapshot> {
    return this.fetch(`/bot-instances/${instanceId}/evolution/sync`, { method: 'POST' });
  }

  // Token Usage (from Gateway)
  async getTokenUsage(instanceId: string): Promise<TokenUsageSummary> {
    return this.fetch(`/bot-instances/${instanceId}/usage`);
  }

  // AI Gateway
  async updateAiGatewaySettings(instanceId: string, settings: AiGatewaySettings): Promise<BotInstance> {
    return this.fetch(`/bot-instances/${instanceId}/ai-gateway`, {
      method: 'PATCH',
      body: JSON.stringify(settings),
    });
  }

  // Resources
  async getBotResources(instanceId: string): Promise<BotResourcesResponse> {
    return this.fetch(`/bot-instances/${instanceId}/resources`);
  }

  async updateBotResources(instanceId: string, dto: UpdateBotResourcesPayload): Promise<BotResourcesUpdateResult> {
    return this.fetch(`/bot-instances/${instanceId}/resources`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    });
  }

  // ============================================
  // Device Pairings
  // ============================================

  async getPairings(instanceId: string, state?: string): Promise<DevicePairing[]> {
    const params = state ? `?state=${state}` : '';
    return this.fetch(`/bot-instances/${instanceId}/pairings${params}`);
  }

  async getPendingPairings(instanceId: string): Promise<DevicePairing[]> {
    return this.fetch(`/bot-instances/${instanceId}/pairings/pending`);
  }

  async approvePairing(instanceId: string, channelType: string, senderId: string): Promise<DevicePairing> {
    return this.fetch(`/bot-instances/${instanceId}/pairings/approve`, {
      method: 'POST',
      body: JSON.stringify({ channelType, senderId }),
    });
  }

  async rejectPairing(instanceId: string, channelType: string, senderId: string): Promise<DevicePairing> {
    return this.fetch(`/bot-instances/${instanceId}/pairings/reject`, {
      method: 'POST',
      body: JSON.stringify({ channelType, senderId }),
    });
  }

  async approveAllPairings(instanceId: string): Promise<{ count: number }> {
    return this.fetch(`/bot-instances/${instanceId}/pairings/approve-all`, {
      method: 'POST',
    });
  }

  async revokePairing(instanceId: string, channelType: string, senderId: string): Promise<DevicePairing> {
    return this.fetch(`/bot-instances/${instanceId}/pairings/revoke`, {
      method: 'POST',
      body: JSON.stringify({ channelType, senderId }),
    });
  }

  async syncPairings(instanceId: string): Promise<DevicePairing[]> {
    return this.fetch(`/bot-instances/${instanceId}/pairings/sync`, {
      method: 'POST',
    });
  }

  // ============================================
  // Channel Management
  // ============================================

  async listChannels(workspaceId: string): Promise<Channel[]> {
    return this.fetch(`/channels?workspaceId=${encodeURIComponent(workspaceId)}`);
  }

  async createChannel(data: CreateChannelPayload): Promise<Channel> {
    return this.fetch('/channels', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteChannel(id: string): Promise<void> {
    await this.fetch(`/channels/${id}`, { method: 'DELETE' });
  }

  async getChannelTypes(): Promise<ChannelTypeInfo[]> {
    return this.fetch('/channels/types');
  }

  async bindChannelToBot(channelId: string, botId: string, purpose: string): Promise<ChannelBotBinding> {
    return this.fetch(`/channels/${channelId}/bind`, {
      method: 'POST',
      body: JSON.stringify({ botId, purpose }),
    });
  }

  async unbindChannel(channelId: string, bindingId: string): Promise<void> {
    await this.fetch(`/channels/${channelId}/bind/${bindingId}`, { method: 'DELETE' });
  }

  // ============================================
  // Bot Chat
  // ============================================

  async chatWithBot(instanceId: string, message: string, sessionId?: string): Promise<{
    response: string;
    sessionId: string;
    status: string;
  }> {
    return this.fetch(`/bot-instances/${instanceId}/chat`, {
      method: 'POST',
      body: JSON.stringify({ message, sessionId }),
    });
  }

  // ============================================
  // A2A Agent Card
  // ============================================

  async getAgentCard(botInstanceId: string): Promise<AgentCard> {
    return this.fetch(`/a2a/${botInstanceId}/agent-card`);
  }

  async sendA2aMessage(botInstanceId: string, message: string, apiKey?: string): Promise<A2aJsonRpcResponse> {
    const ts = Date.now();
    const body = {
      jsonrpc: "2.0",
      id: `msg-${ts}`,
      method: "SendMessage",
      params: {
        message: {
          messageId: `msg-${ts}`,
          role: "user",
          parts: [{ text: message }],
        },
      },
    };
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    return this.fetch(`/a2a/${botInstanceId}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  }

  // ============================================
  // A2A API Keys
  // ============================================

  async generateA2aApiKey(botInstanceId: string, label?: string): Promise<A2aApiKeyCreateResponse> {
    return this.fetch(`/a2a/${botInstanceId}/api-keys`, {
      method: "POST",
      body: JSON.stringify({ label }),
    });
  }

  async listA2aApiKeys(botInstanceId: string): Promise<A2aApiKeyInfo[]> {
    return this.fetch(`/a2a/${botInstanceId}/api-keys`);
  }

  async revokeA2aApiKey(botInstanceId: string, keyId: string): Promise<void> {
    await this.fetch(`/a2a/${botInstanceId}/api-keys/${keyId}`, {
      method: "DELETE",
    });
  }

  // ============================================
  // A2A Tasks
  // ============================================

  async listA2aTasks(botInstanceId: string): Promise<A2aTaskInfo[]> {
    return this.fetch(`/a2a/${botInstanceId}/tasks`);
  }

  /**
   * Stream an A2A message via SSE. Returns an AbortController to cancel the stream.
   */
  streamA2aMessage(
    botInstanceId: string,
    message: string,
    apiKey: string,
    callbacks: {
      onChunk: (text: string) => void;
      onStatus: (state: string, taskId: string) => void;
      onDone: () => void;
      onError: (error: string) => void;
    },
  ): AbortController {
    const controller = new AbortController();
    const body = {
      jsonrpc: "2.0",
      id: `stream-${Date.now()}`,
      method: "message/stream",
      params: {
        message: {
          messageId: `msg-${Date.now()}`,
          role: "user",
          parts: [{ text: message }],
        },
      },
    };

    const baseUrl = API_URL;
    fetch(`${baseUrl}/a2a/${botInstanceId}/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok || !response.body) {
          callbacks.onError(`HTTP ${response.status}: ${response.statusText}`);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (!data) continue;

            try {
              const event = JSON.parse(data);
              if (event.error) {
                callbacks.onError(event.error.message || "Unknown error");
                continue;
              }
              const result = event.result;
              if (result?.statusUpdate) {
                const su = result.statusUpdate;
                callbacks.onStatus(su.status?.state || su.state, su.taskId);
              }
              if (result?.artifactUpdate) {
                const au = result.artifactUpdate;
                const text = au.artifact?.parts
                  ?.map((p: { text?: string }) => p.text)
                  .filter(Boolean)
                  .join("");
                if (text) {
                  if (au.artifact.lastChunk && !au.artifact.append) {
                    // Final full output — don't append, it replaces accumulated chunks
                  } else {
                    callbacks.onChunk(text);
                  }
                }
              }
            } catch {
              // Skip unparseable lines
            }
          }
        }
        callbacks.onDone();
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") {
          callbacks.onDone();
          return;
        }
        callbacks.onError(err instanceof Error ? err.message : String(err));
      });

    return controller;
  }

  async cancelA2aTask(botInstanceId: string, taskId: string, apiKey: string): Promise<A2aJsonRpcResponse> {
    const body = {
      jsonrpc: "2.0",
      id: `cancel-${Date.now()}`,
      method: "tasks/cancel",
      params: { id: taskId },
    };
    const baseUrl = API_URL;
    const response = await window.fetch(`${baseUrl}/a2a/${botInstanceId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    return response.json();
  }

  // ============================================
  // Bot Routing Rules
  // ============================================

  async listRoutingRules(filters?: {
    sourceBotId?: string;
    targetBotId?: string;
    enabled?: boolean;
  }): Promise<BotRoutingRule[]> {
    const params = new URLSearchParams();
    if (filters?.sourceBotId) params.set('sourceBotId', filters.sourceBotId);
    if (filters?.targetBotId) params.set('targetBotId', filters.targetBotId);
    if (filters?.enabled !== undefined) params.set('enabled', String(filters.enabled));
    const query = params.toString();
    return this.fetch(`/bot-routing-rules${query ? `?${query}` : ''}`);
  }

  async getRoutingRule(id: string): Promise<BotRoutingRule> {
    return this.fetch(`/bot-routing-rules/${id}`);
  }

  async createRoutingRule(data: CreateBotRoutingRulePayload): Promise<BotRoutingRule> {
    return this.fetch('/bot-routing-rules', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateRoutingRule(id: string, data: UpdateBotRoutingRulePayload): Promise<BotRoutingRule> {
    return this.fetch(`/bot-routing-rules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteRoutingRule(id: string): Promise<void> {
    await this.fetch(`/bot-routing-rules/${id}`, { method: 'DELETE' });
  }

  // ============================================
  // Bot Team Members
  // ============================================

  async listTeamMembers(ownerBotId: string): Promise<BotTeamMember[]> {
    return this.fetch(`/bot-teams?ownerBotId=${encodeURIComponent(ownerBotId)}`);
  }

  async listMemberOfTeams(memberBotId: string): Promise<BotTeamMember[]> {
    return this.fetch(`/bot-teams?memberBotId=${encodeURIComponent(memberBotId)}`);
  }

  async addTeamMember(data: { ownerBotId: string; memberBotId: string; role: string; description: string }): Promise<BotTeamMember> {
    return this.fetch('/bot-teams', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTeamMember(id: string, data: Partial<{ role: string; description: string; enabled: boolean }>): Promise<BotTeamMember> {
    return this.fetch(`/bot-teams/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async removeTeamMember(id: string): Promise<void> {
    await this.fetch(`/bot-teams/${id}`, { method: 'DELETE' });
  }

  async delegateMessage(data: DelegateRequestPayload): Promise<DelegationResult> {
    return this.fetch('/bot-routing-rules/delegate', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ============================================
  // Notification Channels
  // ============================================

  async listNotificationChannels(filters?: {
    type?: string;
    enabled?: boolean;
  }): Promise<NotificationChannel[]> {
    const params = new URLSearchParams();
    if (filters?.type) params.set('type', filters.type);
    if (filters?.enabled !== undefined) params.set('enabled', String(filters.enabled));
    const query = params.toString();
    return this.fetch(`/notification-channels${query ? `?${query}` : ''}`);
  }

  async getNotificationChannel(id: string): Promise<NotificationChannel> {
    return this.fetch(`/notification-channels/${id}`);
  }

  async createNotificationChannel(data: CreateNotificationChannelPayload): Promise<NotificationChannel> {
    return this.fetch('/notification-channels', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateNotificationChannel(id: string, data: UpdateNotificationChannelPayload): Promise<NotificationChannel> {
    return this.fetch(`/notification-channels/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteNotificationChannel(id: string): Promise<void> {
    await this.fetch(`/notification-channels/${id}`, { method: 'DELETE' });
  }

  async testNotificationChannel(id: string): Promise<NotificationChannel> {
    return this.fetch(`/notification-channels/${id}/test`, { method: 'POST' });
  }

  // ============================================
  // Notification Rules
  // ============================================

  async createNotificationRule(channelId: string, data: CreateNotificationRulePayload): Promise<AlertNotificationRule> {
    return this.fetch(`/notification-channels/${channelId}/rules`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateNotificationRule(ruleId: string, data: UpdateNotificationRulePayload): Promise<AlertNotificationRule> {
    return this.fetch(`/notification-channels/rules/${ruleId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteNotificationRule(ruleId: string): Promise<void> {
    await this.fetch(`/notification-channels/rules/${ruleId}`, { method: 'DELETE' });
  }
}

// ============================================
// Cost & Budget Types
// ============================================

export type CostProvider = 'OPENAI' | 'ANTHROPIC' | 'GOOGLE' | 'AWS_BEDROCK' | 'AZURE_OPENAI' | 'CUSTOM';

export interface CostEvent {
  id: string;
  instanceId: string;
  provider: CostProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  channelType?: string;
  traceId?: string;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

export interface CostSummaryByProvider {
  provider: string;
  _sum: {
    costCents: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
  };
  _count: {
    id: number;
  };
}

export interface CostSummaryByModel {
  model: string;
  provider: string;
  _sum: {
    costCents: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
  };
  _count: {
    id: number;
  };
}

export interface CostSummaryByChannel {
  channelType: string | null;
  _sum: {
    costCents: number | null;
  };
  _count: {
    id: number;
  };
}

export interface CostSummary {
  totalCostCents: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalEvents: number;
  byProvider: CostSummaryByProvider[];
  byModel: CostSummaryByModel[];
  byChannel: CostSummaryByChannel[];
}

export interface PaginatedCostEvents {
  data: CostEvent[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface BudgetConfig {
  id: string;
  instanceId?: string;
  fleetId?: string;
  name: string;
  description?: string;
  monthlyLimitCents: number;
  currency: string;
  warnThresholdPct: number;
  criticalThresholdPct: number;
  currentSpendCents: number;
  periodStart: string;
  periodEnd?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface CreateBudgetPayload {
  name: string;
  instanceId?: string;
  fleetId?: string;
  description?: string;
  monthlyLimitCents: number;
  currency?: string;
  warnThresholdPct?: number;
  criticalThresholdPct?: number;
}

export interface CreateCostEventPayload {
  instanceId: string;
  provider: CostProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  channelType?: string;
  traceId?: string;
}

// ============================================
// Alert Types
// ============================================

export type HealthAlertSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
export type HealthAlertStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED' | 'SUPPRESSED';

export interface HealthAlert {
  id: string;
  instanceId?: string;
  fleetId?: string;
  rule: string;
  severity: HealthAlertSeverity;
  status: HealthAlertStatus;
  title: string;
  message: string;
  detail?: string;
  remediationAction?: string;
  remediationNote?: string;
  firstTriggeredAt: string;
  lastTriggeredAt: string;
  resolvedAt?: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  consecutiveHits: number;
  createdAt: string;
  updatedAt: string;
  instance?: { id: string; name: string; fleetId: string };
  fleet?: { id: string; name: string };
}

export interface AlertSummary {
  bySeverity: Record<string, number>;
  byStatus: Record<string, number>;
  total: number;
}

export interface PaginatedAlerts {
  data: HealthAlert[];
  total: number;
  page: number;
  limit: number;
}

export interface RemediationResult {
  success: boolean;
  action: string;
  message: string;
  detail?: string;
}

// ============================================
// Debug / Introspection Types
// ============================================

export interface DebugProcessInfo {
  pid: number;
  command: string;
  cpuPercent: number;
  memoryMb: number;
  uptime: string;
}

export interface DebugGatewayProbeResult {
  reachable: boolean;
  latencyMs: number;
  protocolVersion: number;
  healthOk: boolean;
  channelsLinked: number;
  uptime: number;
  error?: string;
}

export interface DebugRedactedConfig {
  config: Record<string, unknown>;
  configHash: string;
  source: "gateway" | "target";
}

export interface DebugEnvVarStatus {
  name: string;
  isSet: boolean;
  category: "required" | "optional" | "channel" | "ai";
}

export interface DebugFileInfo {
  path: string;
  size: number;
  lastModified: string;
  isDirectory: boolean;
}

export interface DebugConnectivityResult {
  gatewayPort: { reachable: boolean; latencyMs: number };
  dns: { resolved: boolean; ip?: string };
  internet: { reachable: boolean };
}

// ============================================
// Agent Evolution Types
// ============================================

export interface EvolutionChange {
  category: string;
  field: string;
  changeType: 'added' | 'removed' | 'modified';
  deployedValue?: unknown;
  liveValue?: unknown;
}

export interface AgentEvolutionDiff {
  changes: EvolutionChange[];
  hasEvolved: boolean;
  totalChanges: number;
}

export interface EvolutionSummary {
  hasEvolved: boolean;
  totalChanges: number;
  categoryCounts: Record<string, number>;
  changedCategories: string[];
}

export interface AgentLiveState {
  gatewayReachable: boolean;
  config: Record<string, unknown> | null;
  configHash: string | null;
  health: unknown | null;
  diff: AgentEvolutionDiff;
  summary: EvolutionSummary;
  skills: string[];
  mcpServers: string[];
  channels: string[];
  toolProfile: unknown;
  lastSnapshotAt?: string | null;
}

export interface AgentEvolutionSnapshot {
  hasEvolved: boolean;
  totalChanges: number;
  gatewayReachable: boolean;
  capturedAt: string;
  diff: AgentEvolutionDiff | null;
  liveSkills: string[];
  liveMcpServers: string[];
  liveChannels: string[];
  liveToolProfile: unknown;
  liveConfigHash: string;
  message?: string;
  snapshot?: null;
}

export interface DevicePairing {
  id: string;
  instanceId: string;
  channelType: string;
  senderId: string;
  senderName?: string;
  platform?: string;
  state: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED' | 'EXPIRED';
  approvedAt?: string;
  revokedAt?: string;
  lastSeenAt?: string;
  ipAddress?: string;
  deviceInfo?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// Channel Management Types
// ============================================

export interface ChannelBotBinding {
  id: string;
  botId: string;
  channelId: string;
  purpose: string;
  isActive: boolean;
  settings: Record<string, unknown> | null;
  targetDestination: Record<string, unknown> | null;
  healthStatus: string | null;
  lastHealthCheck: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Channel {
  id: string;
  name: string;
  workspaceId: string;
  type: string;
  config: string;
  defaults: string | null;
  isShared: boolean;
  tags: string | null;
  status: string;
  statusMessage: string | null;
  lastTestedAt: string | null;
  lastError: string | null;
  errorCount: number;
  messagesSent: number;
  messagesFailed: number;
  lastMessageAt: string | null;
  lastActivityAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  botBindings: ChannelBotBinding[];
}

export interface ChannelTypeInfo {
  type: string;
  label: string;
  requiresNodeRuntime: boolean;
  authMethod: 'qr-pairing' | 'token' | 'credentials' | 'service-account';
  requiredSecrets: string[];
  optionalSecrets: string[];
  defaultConfig: Record<string, unknown>;
}

export interface CreateChannelPayload {
  name: string;
  workspaceId: string;
  openclawType: string;
  enabled?: boolean;
  policies?: {
    dmPolicy?: string;
    groupPolicy?: string;
    allowFrom?: string[];
    groupAllowFrom?: string[];
    historyLimit?: number;
    mediaMaxMb?: number;
  };
  typeConfig?: Record<string, unknown>;
  secrets?: Record<string, string>;
  isShared?: boolean;
}

// ============================================
// Token Usage Types (from Gateway usage.cost RPC)
// ============================================

export interface TokenUsageTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  totalCost: number;
}

export interface TokenUsageSummary {
  totals: TokenUsageTotals | null;
  daily: Array<{
    date: string;
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    totalTokens: number;
    totalCost: number;
  }>;
}

// ============================================
// Bot Routing Rule Types
// ============================================

export interface BotRoutingRule {
  id: string;
  workspaceId: string;
  sourceBotId: string;
  targetBotId: string;
  triggerPattern: string;
  description: string;
  priority: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  sourceBot?: { id: string; name: string };
  targetBot?: { id: string; name: string };
}

export interface DelegateRequestPayload {
  sourceBotId: string;
  message: string;
  sessionId?: string;
}

export interface DelegationResult {
  delegated: true;
  targetBotId: string;
  targetBotName: string;
  response: string | undefined;
  traceId: string;
  sessionId: string;
}

export interface CreateBotRoutingRulePayload {
  sourceBotId: string;
  targetBotId: string;
  triggerPattern: string;
  description: string;
  priority?: number;
  enabled?: boolean;
}

export interface UpdateBotRoutingRulePayload {
  sourceBotId?: string;
  targetBotId?: string;
  triggerPattern?: string;
  description?: string;
  priority?: number;
  enabled?: boolean;
}

// ============================================
// Bot Team Member Types
// ============================================

export interface BotTeamMember {
  id: string;
  workspaceId: string;
  ownerBotId: string;
  memberBotId: string;
  role: string;
  description: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  ownerBot?: { id: string; name: string; status: string };
  memberBot?: { id: string; name: string; status: string };
}

// ============================================
// A2A Agent Card Types
// ============================================

export interface AgentSkill {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  examples?: string[];
}

export interface AgentCapabilities {
  streaming: boolean;
  pushNotifications: boolean;
  stateTransitionHistory: boolean;
}

export interface AgentAuthentication {
  schemes: string[];
  credentials?: string;
}

export interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  skills: AgentSkill[];
  capabilities: AgentCapabilities;
  authentication: AgentAuthentication;
  defaultInputModes: string[];
  defaultOutputModes: string[];
  provider?: {
    organization: string;
    url?: string;
  };
}

export interface A2aTaskStatus {
  state: string;
  message?: {
    messageId: string;
    role: string;
    parts: { text?: string }[];
  };
  timestamp?: string;
}

export interface A2aTask {
  id: string;
  contextId: string;
  status: A2aTaskStatus;
  artifacts?: unknown[];
}

export interface A2aJsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: A2aTask;
  error?: { code: number; message: string };
}

export interface A2aApiKeyInfo {
  id: string;
  keyPrefix: string;
  label: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface A2aApiKeyCreateResponse {
  key: string;
  id: string;
}

export interface A2aTaskInfo {
  id: string;
  contextId: string;
  status: {
    state: string;
    message?: {
      messageId: string;
      role: string;
      parts: { text?: string }[];
    };
    timestamp?: string;
  };
  history?: {
    messageId: string;
    role: string;
    parts: { text?: string }[];
  }[];
  metadata?: {
    startedAt?: string;
    endedAt?: string | null;
    durationMs?: number | null;
    inputText?: string | null;
  };
}

// ============================================
// Notification Channel Types
// ============================================

export type NotificationChannelType = 'SLACK_WEBHOOK' | 'WEBHOOK' | 'EMAIL';

export interface NotificationChannel {
  id: string;
  workspaceId: string;
  name: string;
  type: NotificationChannelType;
  config: string;
  enabled: boolean;
  lastTestedAt?: string | null;
  lastDeliveryAt?: string | null;
  lastError?: string | null;
  deliveryCount: number;
  failureCount: number;
  createdAt: string;
  updatedAt: string;
  notificationRules: AlertNotificationRule[];
}

export interface AlertNotificationRule {
  id: string;
  channelId: string;
  severities?: string | null;
  alertRules?: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNotificationChannelPayload {
  name: string;
  type: NotificationChannelType;
  config: string;
  enabled?: boolean;
}

export interface UpdateNotificationChannelPayload {
  name?: string;
  type?: NotificationChannelType;
  config?: string;
  enabled?: boolean;
}

export interface CreateNotificationRulePayload {
  channelId: string;
  severities?: string;
  alertRules?: string;
  enabled?: boolean;
}

export interface UpdateNotificationRulePayload {
  severities?: string;
  alertRules?: string;
  enabled?: boolean;
}

export const api = new ApiClient();
