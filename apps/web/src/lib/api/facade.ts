/**
 * Backward-compatible API client facade.
 *
 * @deprecated Use domain-specific clients directly for better tree-shaking and maintainability.
 *
 * Example migration:
 * ```typescript
 * // Before
 * import { api } from '@/lib/api';
 * const alerts = await api.listAlerts();
 *
 * // After
 * import { alertsClient } from '@/lib/api';
 * const alerts = await alertsClient.list();
 * ```
 */

import { adaptersClient } from './clients/adapters.client';
import { alertsClient } from './clients/alerts.client';
import { a2aClient } from './clients/a2a.client';
import { auditClient } from './clients/audit.client';
import { botInstancesClient } from './clients/bot-instances/composite.client';
import { budgetsClient } from './clients/budgets.client';
import { changeSetsClient } from './clients/change-sets.client';
import { channelsClient } from './clients/channels.client';
import { connectorsClient } from './clients/connectors.client';
import { costsClient } from './clients/costs.client';
import { credentialsClient } from './clients/credentials.client';
import { dashboardClient } from './clients/dashboard.client';
import { debugClient } from './clients/debug.client';
import { fleetsClient } from './clients/fleets.client';
import { healthClient } from './clients/health.client';
import { notificationsClient } from './clients/notifications.client';
import { onboardingClient } from './clients/onboarding.client';
import { overlaysClient } from './clients/overlays.client';
import { pairingsClient } from './clients/pairings.client';
import { policiesClient } from './clients/policies.client';
import { profilesClient } from './clients/profiles.client';
import { slosClient } from './clients/slos.client';
import { teamsClient } from './clients/teams.client';
import { templatesClient } from './clients/templates.client';
import { tracesClient } from './clients/traces.client';
import { userContextClient } from './clients/user-context.client';

// Type imports for method signatures
import type {
  AlertFilters,
  HealthAlert,
  AlertSummary,
  PaginatedAlerts,
  RemediationResult,
} from './types/alerts';
import type {
  BotInstance,
  ListBotInstancesParams,
  InstanceHealth,
  InstanceDrift,
  DiagnosticsResult,
  BulkActionPayload,
  BulkActionResult,
  DeploymentEvent,
  ProvisioningStatus,
  AiGatewaySettings,
  BotResourcesResponse,
  UpdateBotResourcesPayload,
  BotResourcesUpdateResult,
} from './types/bot-instances';
import type {
  Fleet,
  FleetHealth,
  CreateFleetPayload,
  PromoteFleetResult,
} from './types/fleets';
import type {
  AgentCard,
  A2aJsonRpcResponse,
  A2aApiKeyInfo,
  A2aApiKeyCreateResponse,
  A2aTaskInfo,
  A2aStreamCallbacks,
} from './types/a2a';
import type { DevicePairing } from './types/pairings';
import type {
  Channel,
  ChannelTypeInfo,
  CreateChannelPayload,
  ChannelBotBinding,
  ChannelAuthStatus,
} from './types/channels';
import type {
  SloDefinition,
  SloSummary,
  CreateSloPayload,
  SloFilters,
} from './types/slos';
import type {
  CostEvent,
  CostSummary,
  PaginatedCostEvents,
  CreateCostEventPayload,
  CostFilters,
} from './types/costs';
import type {
  BudgetConfig,
  CreateBudgetPayload,
  UpdateBudgetPayload,
  BudgetFilters,
} from './types/budgets';
import type {
  Profile,
  CreateProfilePayload,
  UpdateProfilePayload,
  ProfileFilters,
} from './types/profiles';
import type {
  Template,
  CreateTemplatePayload,
  TemplateConfigPreview,
} from './types/templates';
import type {
  ChangeSet,
  ChangeSetStatus,
  CreateChangeSetPayload,
  ChangeSetFilters,
} from './types/change-sets';
import type { Trace, TraceStats, TraceFilters } from './types/traces';
import type {
  DebugProcessInfo,
  DebugGatewayProbeResult,
  DebugRedactedConfig,
  DebugEnvVarStatus,
  DebugFileInfo,
  DebugConnectivityResult,
} from './types/debug';
import type {
  OnboardingTemplate,
  PreviewOnboardingPayload,
  DeployOnboardingPayload,
  DeployOnboardingResult,
  ValidateAwsPayload,
  ValidateAwsResult,
  DeployStatusResult,
} from './types/onboarding';
import type {
  SavedCredential,
  SaveCredentialPayload,
  SaveCredentialResult,
} from './types/credentials';
import type {
  DashboardMetrics,
  DashboardHealth,
  DashboardActivity,
} from './types/dashboard';
import type {
  NotificationChannel,
  CreateNotificationChannelPayload,
  UpdateNotificationChannelPayload,
  AlertNotificationRule,
  CreateNotificationRulePayload,
  UpdateNotificationRulePayload,
  NotificationChannelFilters,
} from './types/notifications';
import type {
  BotTeamMember,
} from './types/teams';
import type { AdapterMetadata } from './types/adapters';
import type { Overlay } from './types/overlays';
import type { PolicyPack } from './types/policies';
import type { Connector } from './types/connectors';
import type { AuditEvent, AuditFilters } from './types/audit';
import type { HealthCheckResult } from './types/health';
import type { UserContextResponse } from './types/user-context';
import type {
  AgentLiveState,
  AgentEvolutionSnapshot,
  TokenUsageSummary,
} from './types/evolution';
import type { ChatWithBotResult } from './types/chat';

/**
 * Backward-compatible API client.
 * @deprecated Use domain-specific clients directly.
 */
class ApiClient {
  // ============================================
  // Adapters
  // ============================================

  listAdapters = (): Promise<AdapterMetadata[]> => adaptersClient.list();

  // ============================================
  // Bot Instances
  // ============================================

  listBotInstances = (params?: ListBotInstancesParams): Promise<BotInstance[]> =>
    botInstancesClient.list(params);

  getBotInstance = (id: string): Promise<BotInstance> =>
    botInstancesClient.getById(id);

  deleteBotInstance = (id: string): Promise<void> =>
    botInstancesClient.deleteById(id);

  stopBotInstance = (id: string): Promise<void> =>
    botInstancesClient.stop(id);

  startBotInstance = (id: string): Promise<void> =>
    botInstancesClient.start(id);

  getBotInstanceMetrics = (id: string, from: Date, to: Date): Promise<TraceStats> =>
    botInstancesClient.getMetrics(id, from, to);

  compareBots = (ids: string[]): Promise<BotInstance[]> =>
    botInstancesClient.compare(ids);

  bulkAction = (data: BulkActionPayload): Promise<BulkActionResult[]> =>
    botInstancesClient.bulkAction(data);

  getInstanceHealth = (id: string): Promise<InstanceHealth> =>
    botInstancesClient.getHealth(id);

  getInstanceDrift = (id: string): Promise<InstanceDrift> =>
    botInstancesClient.getDrift(id);

  reconcileInstance = (id: string): Promise<void> =>
    botInstancesClient.reconcile(id);

  runDiagnostics = (id: string): Promise<DiagnosticsResult> =>
    botInstancesClient.runDiagnostics(id);

  getInstanceConfig = (id: string): Promise<{ config: Record<string, unknown>; hash: string }> =>
    botInstancesClient.getConfig(id);

  applyConfig = (id: string, config: string): Promise<void> =>
    botInstancesClient.applyConfig(id, config);

  patchBotConfig = (instanceId: string, patch: Record<string, unknown>): Promise<BotInstance> =>
    botInstancesClient.patchConfig(instanceId, patch);

  listDeploymentEvents = (instanceId: string): Promise<DeploymentEvent[]> =>
    botInstancesClient.getDeploymentEvents(instanceId);

  getProvisioningStatus = (instanceId: string): Promise<ProvisioningStatus> =>
    botInstancesClient.getProvisioningStatus(instanceId);

  startChannelAuth = (id: string, channelId: string): Promise<ChannelAuthStatus> =>
    botInstancesClient.startChannelAuth(id, channelId);

  getChannelAuthStatus = (id: string, channelId: string): Promise<ChannelAuthStatus> =>
    botInstancesClient.getChannelAuthStatus(id, channelId);

  getLiveState = (instanceId: string): Promise<AgentLiveState> =>
    botInstancesClient.getLiveState(instanceId);

  getEvolution = (instanceId: string): Promise<AgentEvolutionSnapshot> =>
    botInstancesClient.getEvolution(instanceId);

  getEvolutionHistory = (instanceId: string, limit = 50): Promise<{ snapshots: AgentEvolutionSnapshot[] }> =>
    botInstancesClient.getEvolutionHistory(instanceId, limit);

  syncEvolution = (instanceId: string): Promise<AgentEvolutionSnapshot> =>
    botInstancesClient.syncEvolution(instanceId);

  getTokenUsage = (instanceId: string): Promise<TokenUsageSummary> =>
    botInstancesClient.getTokenUsage(instanceId);

  updateAiGatewaySettings = (instanceId: string, settings: AiGatewaySettings): Promise<BotInstance> =>
    botInstancesClient.updateAiGatewaySettings(instanceId, settings);

  getBotResources = (instanceId: string): Promise<BotResourcesResponse> =>
    botInstancesClient.getResources(instanceId);

  updateBotResources = (instanceId: string, dto: UpdateBotResourcesPayload): Promise<BotResourcesUpdateResult> =>
    botInstancesClient.updateResources(instanceId, dto);

  chatWithBot = (instanceId: string, message: string, sessionId?: string): Promise<ChatWithBotResult> =>
    botInstancesClient.chat(instanceId, message, sessionId);

  // ============================================
  // Fleets
  // ============================================

  listFleets = (): Promise<Fleet[]> => fleetsClient.list();

  getFleet = (id: string): Promise<Fleet> => fleetsClient.getById(id);

  getFleetHealth = (id: string): Promise<FleetHealth> => fleetsClient.getHealth(id);

  createFleet = (data: CreateFleetPayload): Promise<Fleet> => fleetsClient.create(data);

  promoteFleet = (id: string, targetEnvironment: string): Promise<PromoteFleetResult> =>
    fleetsClient.promote(id, targetEnvironment);

  reconcileAllFleet = (id: string): Promise<{ queued: number; skipped: number }> =>
    fleetsClient.reconcileAll(id);

  // ============================================
  // Templates
  // ============================================

  listTemplates = (): Promise<Template[]> => templatesClient.list();

  getTemplate = (id: string): Promise<Template> => templatesClient.getById(id);

  createTemplate = (data: CreateTemplatePayload): Promise<Template> =>
    templatesClient.create(data);

  previewTemplateConfig = (id: string, data: { values?: Record<string, string>; configOverrides?: Record<string, unknown> }): Promise<TemplateConfigPreview> =>
    templatesClient.previewConfig(id, data);

  // ============================================
  // Change Sets
  // ============================================

  listChangeSets = (params?: ChangeSetFilters): Promise<ChangeSet[]> =>
    changeSetsClient.list(params);

  getChangeSet = (id: string): Promise<ChangeSet> => changeSetsClient.getById(id);

  getChangeSetStatus = (id: string): Promise<ChangeSetStatus> =>
    changeSetsClient.getStatus(id);

  createChangeSet = (data: CreateChangeSetPayload): Promise<ChangeSet> =>
    changeSetsClient.create(data);

  startRollout = (id: string): Promise<ChangeSet> => changeSetsClient.startRollout(id);

  rollbackChangeSet = (id: string, reason: string): Promise<ChangeSet> =>
    changeSetsClient.rollback(id, reason);

  // ============================================
  // Traces
  // ============================================

  listTraces = (params?: TraceFilters): Promise<Trace[]> => tracesClient.list(params);

  getTrace = (id: string): Promise<Trace> => tracesClient.getById(id);

  getTraceByTraceId = (traceId: string): Promise<Trace & { children: Trace[] }> =>
    tracesClient.getByTraceId(traceId);

  getTraceTree = (traceId: string): Promise<Trace> => tracesClient.getTree(traceId);

  // ============================================
  // Audit
  // ============================================

  listAuditEvents = (params?: AuditFilters): Promise<AuditEvent[]> =>
    auditClient.list(params);

  // ============================================
  // Profiles
  // ============================================

  listProfiles = (params?: ProfileFilters): Promise<Profile[]> =>
    profilesClient.list(params);

  getProfile = (id: string): Promise<Profile> => profilesClient.getById(id);

  createProfile = (data: CreateProfilePayload): Promise<Profile> =>
    profilesClient.create(data);

  updateProfile = (id: string, data: UpdateProfilePayload): Promise<Profile> =>
    profilesClient.update(id, data);

  deleteProfile = (id: string): Promise<void> => profilesClient.deleteById(id);

  // ============================================
  // Overlays
  // ============================================

  listOverlays = (): Promise<Overlay[]> => overlaysClient.list();

  // ============================================
  // Policy Packs
  // ============================================

  listPolicyPacks = (): Promise<PolicyPack[]> => policiesClient.list();

  // ============================================
  // Connectors
  // ============================================

  listConnectors = (): Promise<Connector[]> => connectorsClient.list();

  // ============================================
  // Health
  // ============================================

  checkHealth = (): Promise<HealthCheckResult> => healthClient.check();

  getMetrics = (): Promise<string> => healthClient.getMetrics();

  // ============================================
  // Dashboard
  // ============================================

  getDashboardMetrics = (): Promise<DashboardMetrics> => dashboardClient.getMetrics();

  getDashboardHealth = (): Promise<DashboardHealth> => dashboardClient.getHealth();

  getDashboardActivity = (): Promise<DashboardActivity> => dashboardClient.getActivity();

  // ============================================
  // Onboarding
  // ============================================

  getOnboardingStatus = (): Promise<{ hasInstances: boolean }> =>
    onboardingClient.getStatus();

  getOnboardingTemplates = (): Promise<OnboardingTemplate[]> =>
    onboardingClient.getTemplates();

  previewOnboarding = (data: PreviewOnboardingPayload): Promise<{ config: Record<string, unknown> }> =>
    onboardingClient.preview(data);

  deployOnboarding = (data: DeployOnboardingPayload): Promise<DeployOnboardingResult> =>
    onboardingClient.deploy(data);

  validateAwsCredentials = (data: ValidateAwsPayload): Promise<ValidateAwsResult> =>
    onboardingClient.validateAwsCredentials(data);

  getDeployStatus = (instanceId: string): Promise<DeployStatusResult> =>
    onboardingClient.getDeployStatus(instanceId);

  // ============================================
  // Credential Vault
  // ============================================

  saveCredential = (data: SaveCredentialPayload): Promise<SaveCredentialResult> =>
    credentialsClient.save(data);

  listSavedCredentials = (type?: string): Promise<SavedCredential[]> =>
    credentialsClient.list(type);

  deleteSavedCredential = (id: string): Promise<void> =>
    credentialsClient.deleteById(id);

  // ============================================
  // Costs
  // ============================================

  listCostEvents = (filters?: CostFilters): Promise<PaginatedCostEvents> =>
    costsClient.list(filters);

  recordCostEvent = (data: CreateCostEventPayload): Promise<CostEvent> =>
    costsClient.record(data);

  getCostSummary = (filters?: Pick<CostFilters, 'instanceId' | 'from' | 'to'>): Promise<CostSummary> =>
    costsClient.getSummary(filters);

  getInstanceCosts = (instanceId: string): Promise<CostSummary> =>
    costsClient.getInstanceCosts(instanceId);

  // ============================================
  // Budgets
  // ============================================

  listBudgets = (filters?: BudgetFilters): Promise<BudgetConfig[]> =>
    budgetsClient.list(filters);

  createBudget = (data: CreateBudgetPayload): Promise<BudgetConfig> =>
    budgetsClient.create(data);

  updateBudget = (id: string, data: UpdateBudgetPayload): Promise<BudgetConfig> =>
    budgetsClient.update(id, data);

  deleteBudget = (id: string): Promise<void> => budgetsClient.deleteById(id);

  // ============================================
  // SLOs
  // ============================================

  listSlos = (filters?: SloFilters): Promise<SloDefinition[]> => slosClient.list(filters);

  getSlo = (id: string): Promise<SloDefinition> => slosClient.getById(id);

  createSlo = (data: CreateSloPayload): Promise<SloDefinition> => slosClient.create(data);

  updateSlo = (id: string, data: Partial<CreateSloPayload> & { isActive?: boolean }): Promise<SloDefinition> =>
    slosClient.update(id, data);

  deleteSlo = (id: string): Promise<void> => slosClient.deleteById(id);

  getSloSummary = (): Promise<SloSummary> => slosClient.getSummary();

  // ============================================
  // Alerts
  // ============================================

  listAlerts = (filters?: AlertFilters): Promise<PaginatedAlerts> =>
    alertsClient.list(filters);

  getAlert = (alertId: string): Promise<HealthAlert> => alertsClient.getById(alertId);

  acknowledgeAlert = (alertId: string, data?: { acknowledgedBy?: string }): Promise<HealthAlert> =>
    alertsClient.acknowledge(alertId, data?.acknowledgedBy);

  resolveAlert = (alertId: string): Promise<HealthAlert> => alertsClient.resolve(alertId);

  suppressAlert = (alertId: string): Promise<HealthAlert> => alertsClient.suppress(alertId);

  remediateAlert = (alertId: string): Promise<RemediationResult> =>
    alertsClient.remediate(alertId);

  bulkAcknowledgeAlerts = (ids: string[], acknowledgedBy?: string): Promise<{ updated: number }> =>
    alertsClient.bulkAcknowledge(ids, acknowledgedBy);

  bulkResolveAlerts = (ids: string[]): Promise<{ updated: number }> =>
    alertsClient.bulkResolve(ids);

  getAlertSummary = (): Promise<AlertSummary> => alertsClient.getSummary();

  getActiveAlertCount = (): Promise<{ count: number }> => alertsClient.getActiveCount();

  // ============================================
  // Debug / Introspection
  // ============================================

  debugGetProcesses = (instanceId: string): Promise<DebugProcessInfo[]> =>
    debugClient.getProcesses(instanceId);

  debugProbeGateway = (instanceId: string): Promise<DebugGatewayProbeResult> =>
    debugClient.probeGateway(instanceId);

  debugGetConfig = (instanceId: string): Promise<DebugRedactedConfig> =>
    debugClient.getConfig(instanceId);

  debugGetEnvStatus = (instanceId: string): Promise<DebugEnvVarStatus[]> =>
    debugClient.getEnvStatus(instanceId);

  debugGetStateFiles = (instanceId: string): Promise<DebugFileInfo[]> =>
    debugClient.getStateFiles(instanceId);

  debugTestConnectivity = (instanceId: string): Promise<DebugConnectivityResult> =>
    debugClient.testConnectivity(instanceId);

  // ============================================
  // User Context
  // ============================================

  getUserContext = (): Promise<UserContextResponse> => userContextClient.getContext();

  // ============================================
  // Device Pairings
  // ============================================

  getPairings = (instanceId: string, state?: string): Promise<DevicePairing[]> =>
    pairingsClient.list(instanceId, state);

  getPendingPairings = (instanceId: string): Promise<DevicePairing[]> =>
    pairingsClient.getPending(instanceId);

  approvePairing = (instanceId: string, channelType: string, senderId: string): Promise<DevicePairing> =>
    pairingsClient.approve(instanceId, channelType, senderId);

  rejectPairing = (instanceId: string, channelType: string, senderId: string): Promise<DevicePairing> =>
    pairingsClient.reject(instanceId, channelType, senderId);

  approveAllPairings = (instanceId: string): Promise<{ count: number }> =>
    pairingsClient.approveAll(instanceId);

  revokePairing = (instanceId: string, channelType: string, senderId: string): Promise<DevicePairing> =>
    pairingsClient.revoke(instanceId, channelType, senderId);

  syncPairings = (instanceId: string): Promise<DevicePairing[]> =>
    pairingsClient.sync(instanceId);

  // ============================================
  // Channel Management
  // ============================================

  listChannels = (workspaceId: string): Promise<Channel[]> =>
    channelsClient.list(workspaceId);

  createChannel = (data: CreateChannelPayload): Promise<Channel> =>
    channelsClient.create(data);

  deleteChannel = (id: string): Promise<void> => channelsClient.deleteById(id);

  getChannelTypes = (): Promise<ChannelTypeInfo[]> => channelsClient.getTypes();

  bindChannelToBot = (channelId: string, botId: string, purpose: string): Promise<ChannelBotBinding> =>
    channelsClient.bind(channelId, botId, purpose);

  unbindChannel = (channelId: string, bindingId: string): Promise<void> =>
    channelsClient.unbind(channelId, bindingId);

  // ============================================
  // A2A Agent Card
  // ============================================

  getAgentCard = (botInstanceId: string): Promise<AgentCard> =>
    a2aClient.getAgentCard(botInstanceId);

  sendA2aMessage = (botInstanceId: string, message: string, apiKey?: string): Promise<A2aJsonRpcResponse> =>
    a2aClient.sendMessage(botInstanceId, message, apiKey);

  streamA2aMessage = (
    botInstanceId: string,
    message: string,
    apiKey: string,
    callbacks: A2aStreamCallbacks,
  ): AbortController => a2aClient.streamMessage(botInstanceId, message, apiKey, callbacks);

  cancelA2aTask = (botInstanceId: string, taskId: string, apiKey: string): Promise<A2aJsonRpcResponse> =>
    a2aClient.cancelTask(botInstanceId, taskId, apiKey);

  listA2aTasks = (botInstanceId: string): Promise<A2aTaskInfo[]> =>
    a2aClient.listTasks(botInstanceId);

  generateA2aApiKey = (botInstanceId: string, label?: string): Promise<A2aApiKeyCreateResponse> =>
    a2aClient.generateApiKey(botInstanceId, label);

  listA2aApiKeys = (botInstanceId: string): Promise<A2aApiKeyInfo[]> =>
    a2aClient.listApiKeys(botInstanceId);

  revokeA2aApiKey = (botInstanceId: string, keyId: string): Promise<void> =>
    a2aClient.revokeApiKey(botInstanceId, keyId);

  // ============================================
  // Bot Team Members
  // ============================================

  listTeamMembers = (ownerBotId: string): Promise<BotTeamMember[]> =>
    teamsClient.listMembers(ownerBotId);

  listMemberOfTeams = (memberBotId: string): Promise<BotTeamMember[]> =>
    teamsClient.listMemberOf(memberBotId);

  addTeamMember = (data: { ownerBotId: string; memberBotId: string; role: string; description: string }): Promise<BotTeamMember> =>
    teamsClient.add(data);

  updateTeamMember = (id: string, data: Partial<{ role: string; description: string; enabled: boolean }>): Promise<BotTeamMember> =>
    teamsClient.update(id, data);

  removeTeamMember = (id: string): Promise<void> => teamsClient.remove(id);

  // ============================================
  // Notification Channels
  // ============================================

  listNotificationChannels = (filters?: NotificationChannelFilters): Promise<NotificationChannel[]> =>
    notificationsClient.listChannels(filters);

  getNotificationChannel = (id: string): Promise<NotificationChannel> =>
    notificationsClient.getChannel(id);

  createNotificationChannel = (data: CreateNotificationChannelPayload): Promise<NotificationChannel> =>
    notificationsClient.createChannel(data);

  updateNotificationChannel = (id: string, data: UpdateNotificationChannelPayload): Promise<NotificationChannel> =>
    notificationsClient.updateChannel(id, data);

  deleteNotificationChannel = (id: string): Promise<void> =>
    notificationsClient.deleteChannel(id);

  testNotificationChannel = (id: string): Promise<NotificationChannel> =>
    notificationsClient.testChannel(id);

  createNotificationRule = (channelId: string, data: CreateNotificationRulePayload): Promise<AlertNotificationRule> =>
    notificationsClient.createRule(channelId, data);

  updateNotificationRule = (ruleId: string, data: UpdateNotificationRulePayload): Promise<AlertNotificationRule> =>
    notificationsClient.updateRule(ruleId, data);

  deleteNotificationRule = (ruleId: string): Promise<void> =>
    notificationsClient.deleteRule(ruleId);
}

/**
 * Singleton API client instance for backward compatibility.
 * @deprecated Use domain-specific clients directly.
 */
export const api = new ApiClient();

export { ApiClient };
